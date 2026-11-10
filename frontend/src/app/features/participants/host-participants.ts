import { Notifications } from '../../shared/notifications';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe, DOCUMENT } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SurfaceCard } from '../../shared/components/surface-card';
import { StatusBadge } from '../../shared/components/status-badge';
import { apiError } from '../../core/http/api-client';
import { KaraokeSession, Participant, SessionApi, SongRequest } from '../sessions/session-api';
import { StageApi } from '../stage/stage-api';

@Component({
  selector: 'app-host-participants',
  imports: [
    ConfirmationDialog,
    DatePipe,
    ReactiveFormsModule,
    InputTextModule,
    SurfaceCard,
    StatusBadge,
  ],
  templateUrl: './host-participants.html',
})
export class HostParticipants {
  readonly session = input.required<KaraokeSession>();
  readonly people = input.required<Participant[]>();
  readonly requests = input.required<SongRequest[]>();
  readonly disabled = input(false);
  readonly changed = output<void>();
  readonly working = output<boolean>();
  private readonly api = inject(SessionApi);
  private readonly stage = inject(StageApi);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  readonly busy = signal(false);
  readonly locked = computed(() => this.busy() || this.disabled());
  readonly registering = signal(false);
  readonly personId = signal<string | null>(null);
  readonly person = computed(() => this.people().find((p) => p.id === this.personId()) ?? null);
  readonly addingSong = signal(false);
  readonly directoryOpen = signal(false);
  readonly search = signal('');
  readonly filter = signal('all');
  readonly error = signal('');
  private readonly notifications = inject(Notifications);
  readonly confirmation = signal<'leave' | 'pause' | 'resume' | 'reactivate' | null>(null);
  readonly confirmationTitle = computed(() => {
    const action = this.confirmation();
    return (
      (action === 'leave'
        ? 'Confirmar saída de '
        : action === 'pause'
          ? 'Pausar '
          : action === 'resume'
            ? 'Retomar '
            : 'Reativar ') +
      (this.person()?.name ?? '') +
      '?'
    );
  });
  readonly visiblePeople = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.people().filter(
      (p) =>
        (this.filter() === 'all' ||
          (this.filter() === 'active' ? p.status === 'ACTIVE' : p.status !== 'ACTIVE')) &&
        `${p.name} ${p.tableLabel ?? ''}`.toLocaleLowerCase().includes(query),
    );
  });
  readonly songs = computed(() =>
    this.requests().filter((s) => s.participantId === this.personId()),
  );
  readonly registrationForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    title: ['', [Validators.required, Validators.maxLength(160)]],
    tableLabel: ['', Validators.maxLength(40)],
    artist: ['', Validators.maxLength(160)],
  });
  readonly songForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    artist: ['', Validators.maxLength(160)],
  });
  private registrationKey = crypto.randomUUID();
  private songKey = crypto.randomUUID();
  private context = '';
  constructor() {
    effect(() => {
      const id = this.session().id;
      const open = this.session().status === 'OPEN';
      untracked(() => {
        if (!open) {
          this.registering.set(false);
          this.addingSong.set(false);
          this.confirmation.set(null);
        }
        if (id === this.context) return;
        this.context = id;
        this.registering.set(false);
        this.personId.set(null);
        this.addingSong.set(false);
        this.confirmation.set(null);
        this.directoryOpen.set(false);
        this.search.set('');
        this.filter.set('all');
        this.error.set('');
        this.registrationForm.reset();
        this.songForm.reset();
        this.registrationKey = crypto.randomUUID();
        this.songKey = crypto.randomUUID();
      });
    });
  }
  private focus(id: string) {
    afterNextRender(() => this.document.getElementById(id)?.focus(), { injector: this.injector });
  }
  beginRegistration() {
    this.registering.set(true);
    this.error.set('');
    this.focus('registration-name');
  }
  cancelRegistration() {
    this.registering.set(false);
    this.focus('create-participant-button');
  }
  showPerson(id: string) {
    this.personId.set(id);
    this.confirmation.set(null);
    this.addingSong.set(false);
    this.error.set('');
    this.focus('participant-detail-title');
  }
  back() {
    const id = this.personId();
    this.personId.set(null);
    this.confirmation.set(null);
    this.addingSong.set(false);
    this.directoryOpen.set(true);
    if (!this.visiblePeople().some((person) => person.id === id)) {
      this.search.set('');
      this.filter.set('all');
    }
    this.focus(`participant-${id}`);
  }
  startSong() {
    this.songForm.reset();
    this.songKey = crypto.randomUUID();
    this.addingSong.set(true);
    this.focus('new-song-title');
  }
  cancelSong() {
    this.addingSong.set(false);
    this.focus('add-participant-song');
  }
  ask(action: 'leave' | 'pause' | 'resume' | 'reactivate') {
    this.confirmation.set(action);
  }
  cancelAction() {
    this.confirmation.set(null);
  }
  private async run(work: () => Promise<void>) {
    if (this.locked() || this.session().status !== 'OPEN') return;
    this.busy.set(true);
    this.working.emit(true);
    this.error.set('');
    try {
      await work();
      this.changed.emit();
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
      this.working.emit(false);
    }
  }
  async register() {
    if (this.registrationForm.invalid) return;
    await this.run(async () => {
      await this.api.register(this.session().id, {
        ...this.registrationForm.getRawValue(),
        operationId: this.registrationKey,
      });
      this.registrationKey = crypto.randomUUID();
      this.registrationForm.reset();
      this.registering.set(false);
      this.directoryOpen.set(true);
      this.notifications.success('Participante inscrito com a primeira música.');
      this.focus('participant-directory-title');
    });
  }
  async addSong() {
    const person = this.person();
    if (!person || this.songForm.invalid) return;
    await this.run(async () => {
      await this.api.add(this.session().id, person.id, {
        ...this.songForm.getRawValue(),
        operationId: this.songKey,
      });
      this.songKey = crypto.randomUUID();
      this.addingSong.set(false);
      this.notifications.success('Nova música adicionada ao mesmo participante.');
      this.focus('participant-detail-title');
    });
  }
  async confirmAction() {
    const person = this.person(),
      action = this.confirmation();
    if (!person || !action) return;
    await this.run(async () => {
      if (action === 'leave') await this.api.leave(this.session().id, person.id);
      else await this.stage.availability(this.session().id, person.id, action);
      this.confirmation.set(null);
      this.notifications.success(
        action === 'leave' ? 'Saída registrada. Histórico preservado.' : 'Participação atualizada.',
      );
      this.focus('participant-detail-title');
    });
  }
  status(status: string) {
    return (
      (
        {
          ACTIVE: 'Participando',
          PAUSED: 'Pausado',
          SUSPENDED: 'Aguardando rodada',
          INACTIVE: 'Inativo por ausência',
          LEFT: 'Saiu',
        } as Record<string, string>
      )[status] ?? status
    );
  }
  requestStatus(status: string) {
    return (
      (
        {
          PENDING: 'Pendente',
          RESERVED: 'Convocada',
          COMPLETED: 'Concluída',
          SUSPENDED: 'Suspensa',
          CANCELLED: 'Cancelada',
        } as Record<string, string>
      )[status] ?? status
    );
  }
}
