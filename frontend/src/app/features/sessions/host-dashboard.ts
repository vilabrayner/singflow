import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { HostAuth } from '../identity/host-auth';
import { SessionApi, KaraokeSession, Participant } from './session-api';
import { apiError } from '../../core/http/api-client';

@Component({
  selector: 'app-host-dashboard',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, DatePipe],
  templateUrl: './host-dashboard.html',
})
export class HostDashboard implements OnInit {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly auth = inject(HostAuth);
  private readonly api = inject(SessionApi);
  readonly ready = signal(false);
  readonly email = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly sessions = signal<KaraokeSession[]>([]);
  readonly selected = signal<KaraokeSession | null>(null);
  readonly participants = signal<Participant[]>([]);
  readonly requests = signal<import('./session-api').SongRequest[]>([]);
  readonly search = signal('');
  readonly addingFor = signal<Participant | null>(null);
  readonly leaving = signal<Participant | null>(null);
  readonly confirmingClose = signal(false);
  readonly visibleParticipants = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.participants().filter((p) =>
      `${p.name} ${p.tableLabel ?? ''}`.toLocaleLowerCase().includes(query),
    );
  });
  readonly loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  readonly sessionForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
  });
  readonly registrationForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    tableLabel: ['', Validators.maxLength(40)],
    title: ['', [Validators.required, Validators.maxLength(160)]],
    artist: ['', Validators.maxLength(160)],
  });
  readonly songForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    artist: ['', Validators.maxLength(160)],
  });
  private createKey = crypto.randomUUID();
  private registrationKey = crypto.randomUUID();
  private songKey = crypto.randomUUID();

  async ngOnInit() {
    try {
      this.email.set((await this.auth.me()).email);
      await this.loadSessions();
    } catch (error) {
      if (!(error instanceof HttpErrorResponse && error.status === 401))
        this.error.set(apiError(error));
    } finally {
      this.ready.set(true);
    }
  }
  private async run(action: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await action();
    } catch (error) {
      this.error.set(apiError(error));
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.email.set('');
        this.clearSession();
      }
    } finally {
      this.busy.set(false);
    }
  }
  private clearSession() {
    this.selected.set(null);
    this.participants.set([]);
    this.requests.set([]);
    this.addingFor.set(null);
    this.leaving.set(null);
    this.confirmingClose.set(false);
  }
  private async loadSessions() {
    this.sessions.set(await this.api.list());
  }
  async login() {
    if (this.loginForm.invalid) return;
    await this.run(async () => {
      const form = this.loginForm.getRawValue();
      await this.auth.login(form.email, form.password);
      this.loginForm.controls.password.reset();
      this.email.set((await this.auth.me()).email);
      await this.loadSessions();
    });
  }
  async logout() {
    await this.run(async () => {
      await this.auth.logout();
      this.email.set('');
      this.sessions.set([]);
      this.clearSession();
    });
  }
  async create() {
    if (this.sessionForm.invalid) return;
    await this.run(async () => {
      const session = await this.api.create(this.sessionForm.controls.name.value, this.createKey);
      this.createKey = crypto.randomUUID();
      this.sessionForm.reset();
      await this.loadSessions();
      await this.loadSession(session);
      this.notice.set('Sessão criada. Abra para receber participantes.');
    });
  }
  private async loadSession(session: KaraokeSession) {
    const [participants, requests] = await Promise.all([
      this.api.participants(session.id),
      this.api.requests(session.id),
    ]);
    this.selected.set(session);
    this.participants.set(participants);
    this.requests.set(requests);
    this.addingFor.set(null);
    this.leaving.set(null);
    this.confirmingClose.set(false);
    this.search.set('');
  }
  async select(session: KaraokeSession) {
    await this.run(() => this.loadSession(session));
  }
  async refresh() {
    await this.run(async () => {
      const id = this.selected()?.id;
      await this.loadSessions();
      const session = this.sessions().find((s) => s.id === id);
      if (session) await this.loadSession(session);
    });
  }
  async transition(action: 'open' | 'close') {
    const session = this.selected();
    if (!session) return;
    await this.run(async () => {
      const updated = await this.api.transition(session.id, action);
      await this.loadSessions();
      await this.loadSession(updated);
      this.notice.set(action === 'open' ? 'Sessão aberta.' : 'Sessão encerrada.');
    });
  }
  async register() {
    const session = this.selected();
    if (!session || this.registrationForm.invalid) return;
    await this.run(async () => {
      await this.api.register(session.id, {
        ...this.registrationForm.getRawValue(),
        operationId: this.registrationKey,
      });
      this.registrationKey = crypto.randomUUID();
      this.registrationForm.reset();
      await this.loadSession(session);
      this.notice.set('Participante inscrito com a primeira música.');
    });
  }
  startSong(participant: Participant) {
    this.addingFor.set(participant);
    this.songForm.reset();
    this.songKey = crypto.randomUUID();
  }
  async addSong() {
    const session = this.selected(),
      participant = this.addingFor();
    if (!session || !participant || this.songForm.invalid) return;
    await this.run(async () => {
      await this.api.add(session.id, participant.id, {
        ...this.songForm.getRawValue(),
        operationId: this.songKey,
      });
      this.songKey = crypto.randomUUID();
      await this.loadSession(session);
      this.notice.set('Nova música adicionada ao mesmo participante.');
    });
  }
  async leave() {
    const session = this.selected(),
      participant = this.leaving();
    if (!session || !participant) return;
    await this.run(async () => {
      await this.api.leave(session.id, participant.id);
      await this.loadSession(session);
      this.notice.set('Saída registrada. Pedidos pendentes cancelados; histórico preservado.');
    });
  }
  songsFor(id: string) {
    return this.requests().filter((r) => r.participantId === id);
  }
}
