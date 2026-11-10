import { Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { StageApi, StageView, Suggestion, callStatus } from './stage-api';
import { apiError } from '../../core/http/api-client';

@Component({
  selector: 'app-stage-panel',
  imports: [DatePipe, ReactiveFormsModule, ButtonModule, InputTextModule],
  templateUrl: './stage-panel.html',
})
export class StagePanel {
  readonly sessionId = input.required<string>();
  readonly open = input.required<boolean>();
  readonly disabled = input(false);
  readonly revision = input(0);
  readonly changed = output<void>();
  private readonly api = inject(StageApi);
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly state = signal<StageView | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly pendingOutcome = signal<string | null>(null);
  readonly choosingNext = signal<Suggestion | null>(null);
  readonly labels = callStatus;
  readonly songForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    artist: ['', Validators.maxLength(160)],
  });
  private generation = 0;
  private confirmationKey = crypto.randomUUID();
  constructor() {
    effect(() => {
      const session = this.sessionId();
      this.revision();
      untracked(() => void this.load(session));
    });
  }
  private async load(session: string) {
    const generation = ++this.generation;
    this.error.set('');
    this.choosingNext.set(null);
    this.pendingOutcome.set(null);
    try {
      const next = await this.api.snapshot(session);
      if (generation === this.generation) {
        this.install(next);
      }
    } catch (error) {
      if (generation === this.generation) {
        this.state.set(null);
        this.error.set(apiError(error));
      }
    }
  }
  private install(next: StageView) {
    const previous = this.state()?.active?.id;
    this.state.set(next);
    if (previous !== next.active?.id)
      this.songForm.reset({ title: next.active?.title ?? '', artist: next.active?.artist ?? '' });
  }
  async refresh() {
    if (!this.busy()) await this.load(this.sessionId());
  }
  choose(suggestion: Suggestion) {
    this.confirmationKey = crypto.randomUUID();
    this.choosingNext.set(suggestion);
  }
  private async run(work: () => Promise<StageView>) {
    if (this.busy() || this.disabled()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    const session = this.sessionId(),
      generation = ++this.generation;
    try {
      const next = await work();
      if (this.sessionId() === session && generation === this.generation) {
        this.install(next);
        this.pendingOutcome.set(null);
        this.choosingNext.set(null);
        this.notice.set('Operação registrada.');
        this.changed.emit();
      }
    } catch (error) {
      if (this.sessionId() === session) {
        this.error.set(apiError(error));
      }
    } finally {
      this.busy.set(false);
    }
  }
  async confirm() {
    const next = this.choosingNext();
    if (!next) return;
    await this.run(() => this.api.confirm(this.sessionId(), this.confirmationKey, next));
  }
  async resolve() {
    const call = this.state()?.active,
      outcome = this.pendingOutcome();
    if (!call || !outcome) return;
    if (outcome === 'COMPLETED' && !call.requestId && this.songForm.invalid) {
      this.error.set('Informe a música antes de concluir.');
      return;
    }
    const song = this.songForm.getRawValue();
    await this.run(() =>
      this.api.resolve(this.sessionId(), call.id, outcome, song.title, song.artist),
    );
  }
  async release(person: string) {
    await this.run(() => this.api.availability(this.sessionId(), person, 'resume'));
  }
}
