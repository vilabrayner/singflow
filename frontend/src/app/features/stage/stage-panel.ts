import {
  CdkDrag,
  CdkDragHandle,
  CdkDropList,
  CdkDragDrop,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { HistoryItem } from '../../shared/components/history-item';
import { SongSearch } from '../../shared/components/song-search';
import { createOperationId } from '../../shared/operation-id';
import { Notifications } from '../../shared/notifications';
import { MenuItem } from 'primeng/api';
import { OptionsMenu } from '../../shared/components/options-menu';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import {
  afterNextRender,
  Injector,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { StageApi, StageCall, StageView, Suggestion, callStatus } from './stage-api';
import { SurfaceCard } from '../../shared/components/surface-card';
import { StatusBadge } from '../../shared/components/status-badge';
import { apiError } from '../../core/http/api-client';

type CallSelection = Pick<Suggestion, 'participantId' | 'name' | 'requestId' | 'title'>;

@Component({
  selector: 'app-stage-panel',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    HistoryItem,
    SongSearch,
    ConfirmationDialog,
    OptionsMenu,
    ReactiveFormsModule,
    InputTextModule,
    SurfaceCard,
    StatusBadge,
  ],
  templateUrl: './stage-panel.html',
  styleUrls: ['../../shared/styles/song-panels.css', '../../shared/styles/host-panels.css'],
})
export class StagePanel {
  readonly sessionId = input.required<string>();
  readonly open = input.required<boolean>();
  readonly disabled = input(false);
  readonly revision = input(0);
  readonly changed = output<void>();
  readonly personSelected = output<string>();
  readonly participantsRequested = output<void>();
  readonly entryRequested = output<void>();
  readonly queueMenuItems = computed<MenuItem[]>(() => [
    {
      label: 'Compartilhar link e QR Code',
      icon: 'pi pi-qrcode',
      disabled: !this.open(),
      command: () => this.entryRequested.emit(),
    },
    {
      label: 'Participantes',
      icon: 'pi pi-users',
      command: () => this.participantsRequested.emit(),
    },
  ]);
  readonly working = output<boolean>();
  readonly stageMenuItems = computed<MenuItem[]>(() => [
    {
      label: 'Registrar falta',
      icon: 'pi pi-user-minus',
      disabled: this.locked() || !this.open(),
      command: () => this.chooseOutcome('ABSENT'),
    },
    {
      label: 'Agora não quer cantar',
      icon: 'pi pi-pause',
      disabled: this.locked() || !this.open(),
      command: () => this.chooseOutcome('DECLINED'),
    },
    {
      label: 'Cancelar por engano',
      icon: 'pi pi-undo',
      disabled: this.locked() || !this.open(),
      command: () => this.chooseOutcome('CANCELLED'),
    },
  ]);
  readonly search = signal('');
  readonly dragging = signal(false);
  readonly availabilityChoice = signal<{ person: Suggestion; action: 'pause' | 'resume' } | null>(
    null,
  );
  readonly outOfOrder = signal(false);
  private dragOrder: string[] = [];
  private reorderOperation: { body: string; id: string } | null = null;
  captureQueue() {
    this.dragOrder = (this.state()?.suggestions ?? []).map((p) => p.participantId);
    this.dragging.set(true);
  }
  async dropQueue(event: CdkDragDrop<Suggestion[]>) {
    this.dragging.set(false);
    if (this.locked() || this.search().trim() || event.previousIndex === event.currentIndex) return;
    const current = (this.state()?.suggestions ?? []).map((p) => p.participantId);
    if (JSON.stringify(current) !== JSON.stringify(this.dragOrder)) return;
    const order = [...current];
    moveItemInArray(order, event.previousIndex, event.currentIndex);
    await this.saveOrder(current, order);
  }
  async nudgeQueue(person: Suggestion, direction: number) {
    if (this.locked() || this.search().trim()) return;
    const expected = (this.state()?.suggestions ?? []).map((p) => p.participantId),
      index = expected.indexOf(person.participantId),
      target = index + direction;
    if (index < 0 || target < 0 || target >= expected.length) return;
    const order = [...expected];
    moveItemInArray(order, index, target);
    await this.saveOrder(expected, order);
  }
  private async saveOrder(expected: string[], order: string[]) {
    const body = JSON.stringify({ expected, order });
    if (this.reorderOperation?.body !== body)
      this.reorderOperation = { body, id: createOperationId() };
    await this.run(() =>
      this.api.reorder(this.sessionId(), this.reorderOperation!.id, expected, order),
    );
    if (!this.error()) this.reorderOperation = null;
    else {
      const session = this.sessionId();
      try {
        const view = await this.api.snapshot(session);
        if (session === this.sessionId()) this.state.set(view);
      } catch {}
    }
  }
  async confirmAvailability() {
    const choice = this.availabilityChoice();
    if (!choice) return;
    await this.run(() =>
      this.api.availability(this.sessionId(), choice.person.participantId, choice.action),
    );
    if (!this.error()) this.availabilityChoice.set(null);
  }
  queuePosition(id: string) {
    return (this.state()?.suggestions.findIndex((p) => p.participantId === id) ?? -1) + 1;
  }

  readonly visibleSuggestions = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return (this.state()?.suggestions ?? []).filter((p) =>
      `${p.name} ${p.tableLabel ?? ''} ${p.title ?? ''} ${p.artist ?? ''}`
        .toLocaleLowerCase()
        .includes(query),
    );
  });
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly api = inject(StageApi);
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly state = signal<StageView | null>(null);
  readonly busy = signal(false);
  readonly loading = signal(false);
  readonly locked = computed(() => this.busy() || this.loading() || this.disabled());
  readonly error = signal('');
  private readonly notifications = inject(Notifications);
  readonly pendingOutcome = signal<string | null>(null);
  readonly choosingNext = signal<CallSelection | null>(null);
  readonly labels = callStatus;
  readonly songForm = this.fb.group({
    selectionToken: [''],
    title: ['', [Validators.required, Validators.maxLength(160)]],
    artist: ['', Validators.maxLength(160)],
  });
  private focus(id: string) {
    afterNextRender(() => this.document.getElementById(id)?.focus(), { injector: this.injector });
  }
  chooseOutcome(outcome: string) {
    this.pendingOutcome.set(outcome);
  }
  cancelOutcome() {
    this.pendingOutcome.set(null);
  }
  callFocusId() {
    if (this.definingActiveSong()) return 'define-active-song';
    const id = this.choosingNext()?.participantId;
    return id && id !== this.state()?.suggestions[0]?.participantId ? 'call-' + id : 'approve-next';
  }
  cancelCall() {
    const target = this.callFocusId();
    this.choosingNext.set(null);
    this.focus(target);
  }
  private context = '';
  private generation = 0;
  private confirmationKey: string = createOperationId();
  constructor() {
    effect(() => {
      const session = this.sessionId();
      this.revision();
      untracked(() => void this.load(session));
    });
    effect((onCleanup) => {
      const session = this.sessionId();
      if (!this.open()) return;
      let cancelled = false;
      let checking = false;
      const timer = setInterval(async () => {
        const previous = this.state();
        if (
          !previous ||
          checking ||
          this.document.hidden ||
          this.locked() ||
          this.pendingOutcome() ||
          this.choosingNext() ||
          this.availabilityChoice() ||
          this.dragging()
        )
          return;
        checking = true;
        const generation = this.generation;
        try {
          const snapshot = await this.api.snapshot(session);
          if (
            cancelled ||
            generation !== this.generation ||
            this.locked() ||
            this.pendingOutcome() ||
            this.choosingNext() ||
            this.availabilityChoice() ||
            this.dragging()
          )
            return;
          this.state.set(snapshot);
          const queueChanged =
            previous.suggestions.length !== snapshot.suggestions.length ||
            previous.suggestions.some(
              (suggestion, index) =>
                suggestion.participantId !== snapshot.suggestions[index].participantId ||
                suggestion.requestId !== snapshot.suggestions[index].requestId,
            );
          if (snapshot.active?.id !== previous.active?.id || queueChanged) this.changed.emit();
        } catch {
          // The manual refresh remains available if the background check fails.
        } finally {
          checking = false;
        }
      }, 4000);
      onCleanup(() => {
        cancelled = true;
        clearInterval(timer);
      });
    });
  }
  private async load(session: string) {
    const generation = ++this.generation;
    this.loading.set(true);
    if (this.context !== session) {
      this.context = session;
      this.reorderOperation = null;
      this.availabilityChoice.set(null);
      this.dragging.set(false);
      this.search.set('');
      this.state.set(null);
      this.songForm.reset();
    }
    this.error.set('');
    this.choosingNext.set(null);
    this.pendingOutcome.set(null);
    try {
      const next = await this.api.snapshot(session);
      if (generation === this.generation) {
        this.state.set(next);
      }
    } catch (error) {
      if (generation === this.generation) {
        this.state.set(null);
        this.error.set(apiError(error));
      }
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  definingActiveSong() {
    return this.state()?.active?.id === this.confirmationKey;
  }
  choose(suggestion: CallSelection, operation: string = createOperationId()) {
    this.confirmationKey = operation;
    this.outOfOrder.set(
      operation !== this.state()?.active?.id &&
        suggestion.participantId !== this.state()?.suggestions[0]?.participantId,
    );
    this.error.set('');
    this.songForm.reset();
    this.choosingNext.set(suggestion);
  }
  chooseActiveSong(call: StageCall) {
    this.choose(
      {
        participantId: call.participantId,
        name: call.participantName,
        requestId: null,
        title: null,
      },
      call.id,
    );
  }
  private async run(work: () => Promise<StageView>) {
    if (this.locked()) return;
    this.busy.set(true);
    this.working.emit(true);
    this.error.set('');
    const session = this.sessionId(),
      generation = ++this.generation;
    try {
      const next = await work();
      if (this.sessionId() === session && generation === this.generation) {
        this.state.set(next);
        this.pendingOutcome.set(null);
        this.choosingNext.set(null);
        this.notifications.success('Operação registrada.');
        this.focus(next.active ? 'active-call-title' : 'stage-title');
        this.changed.emit();
      }
    } catch (error) {
      if (this.sessionId() === session) {
        this.error.set(apiError(error));
      }
    } finally {
      this.busy.set(false);
      this.working.emit(false);
    }
  }
  async confirm() {
    const next = this.choosingNext();
    if (!next) return;
    const song = next.requestId ? undefined : this.songForm.getRawValue();
    if (song && (!song.title.trim() || this.songForm.invalid)) return;
    await this.run(() =>
      this.api.confirm(this.sessionId(), this.confirmationKey, next, song, this.outOfOrder()),
    );
  }
  async resolve() {
    const call = this.state()?.active,
      outcome = this.pendingOutcome();
    if (!call || !outcome) return;
    await this.run(() => this.api.resolve(this.sessionId(), call.id, outcome));
  }
  async release(person: string) {
    await this.run(() => this.api.availability(this.sessionId(), person, 'resume'));
  }
}
