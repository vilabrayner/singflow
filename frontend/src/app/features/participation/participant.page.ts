import { ParticipationMemory } from './participation-memory';
import { createOperationId } from '../../shared/operation-id';
import { MenuItem } from 'primeng/api';
import { OptionsMenu } from '../../shared/components/options-menu';
import { PanelHeader } from '../../shared/components/panel-header';
import { StatusBadge } from '../../shared/components/status-badge';
import { SurfaceCard } from '../../shared/components/surface-card';
import { Notifications } from '../../shared/notifications';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import {
  afterNextRender,
  Component,
  computed,
  inject,
  Injector,
  signal,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ApiClient, apiError } from '../../core/http/api-client';
import { KaraokeSession, Participant, SongRequest } from '../sessions/session-api';

interface OwnView {
  session: KaraokeSession;
  participant: Participant;
  requests: SongRequest[];
  active: {
    id: string;
    title: string | null;
    artist: string | null;
    acceptedAt: string | null;
  } | null;
  history: { id: string; title: string | null; artist: string | null; status: string }[];
  suggested: boolean;
  expiresAt: string | null;
  queuePosition: number | null;
  canReturn: boolean;
}
@Component({
  imports: [
    ConfirmationDialog,
    OptionsMenu,
    PanelHeader,
    StatusBadge,
    SurfaceCard,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    DatePipe,
    NgTemplateOutlet,
  ],
  templateUrl: './participant.page.html',
})
export class ParticipantPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiClient);
  private readonly memory = inject(ParticipationMemory);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly session = this.route.snapshot.paramMap.get('session') ?? '';
  private readonly code = this.route.snapshot.paramMap.get('code') ?? '';
  private readonly base = `/participation/${this.session}`;
  readonly own = signal<OwnView | null>(null);
  readonly currentRequests = computed(
    () => this.own()?.requests.filter((song) => song.status !== 'COMPLETED') ?? [],
  );
  readonly entry = signal<{ name: string; status: string } | null>(null);
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  private readonly notifications = inject(Notifications);
  readonly departed = signal(false);
  readonly cancellingSong = signal<SongRequest | null>(null);
  readonly addingSong = signal(false);
  readonly skippingCall = signal<string | null>(null);
  readonly confirmingExit = signal(false);
  readonly participationOptions: MenuItem[] = [
    {
      label: 'Sair da fila',
      icon: 'pi pi-sign-out',
      command: () => this.confirmingExit.set(true),
    },
  ];
  readonly confirmingForget = signal(false);
  readonly lastUpdated = signal<Date | null>(null);
  readonly disconnected = signal(false);
  readonly joinForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    tableLabel: ['', Validators.maxLength(40)],
    title: ['', [Validators.required, Validators.maxLength(160)]],
    artist: ['', Validators.maxLength(160)],
  });
  readonly songForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    artist: ['', Validators.maxLength(160)],
  });
  readonly returnForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    artist: ['', Validators.maxLength(160)],
  });
  private returnOperation: { body: string; operationId: string } | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private loading = false;
  private destroyed = false;
  private songOperation: { body: string; operationId: string } | null = null;
  private readonly visible = () => {
    if (!document.hidden) void this.refresh();
  };
  async ngOnInit() {
    if (!/^[0-9a-f-]{36}$/i.test(this.session) || !this.code) {
      this.error.set('Peça ao anfitrião o link ou QR Code da sessão.');
      this.ready.set(true);
      return;
    }
    try {
      await this.load();
    } catch (error) {
      if (error instanceof HttpErrorResponse && [401, 410].includes(error.status))
        this.memory.forget(this.session);
      if (error instanceof HttpErrorResponse && error.status === 401 && this.code !== 'vinculado') {
        try {
          this.entry.set(
            await this.api.get(
              `/public/sessions/${this.session}?code=${encodeURIComponent(this.code)}`,
            ),
          );
        } catch (e) {
          this.error.set(this.message(e));
        }
      } else this.error.set(this.message(error));
    } finally {
      this.ready.set(true);
    }
    this.timer = setInterval(() => {
      if (!document.hidden) void this.refresh();
    }, 10000);
    document.addEventListener('visibilitychange', this.visible);
  }
  retryAccess() {
    if (!this.ready()) return;
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.visible);
    this.error.set('');
    this.ready.set(false);
    void this.ngOnInit();
  }
  ngOnDestroy() {
    this.destroyed = true;
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.visible);
  }
  private message(error: unknown) {
    if (error instanceof HttpErrorResponse) {
      if ([401, 410].includes(error.status))
        return 'Seu acesso terminou. Procure o anfitrião para retornar sem duplicar seu cadastro.';
      if (error.status === 404)
        return error.error?.detail ?? 'Link indisponível. Peça o QR Code atual ao anfitrião.';
      if (error.status === 429) return 'Muitas tentativas. Aguarde um minuto e tente novamente.';
    }
    return apiError(error);
  }
  private accept(view: OwnView) {
    if (this.destroyed) return;
    const previous = this.own();
    if (previous && previous.participant.id !== view.participant.id) {
      this.addingSong.set(false);
      this.confirmingExit.set(false);
      this.confirmingForget.set(false);
      this.cancellingSong.set(null);
      this.songForm.reset();
      this.returnForm.reset();
      this.songOperation = null;
      this.returnOperation = null;
    }
    this.own.set(view);
    if (view.session.status === 'OPEN') this.memory.remember(this.session);
    else this.memory.forget(this.session);
    if (view.active?.id !== this.skippingCall() || view.active?.acceptedAt) {
      this.skippingCall.set(null);
    }
    if (view.session.status !== 'OPEN' || view.participant.status !== 'ACTIVE') {
      this.addingSong.set(false);
    }
    this.entry.set(null);
    this.lastUpdated.set(new Date());
    this.disconnected.set(false);
  }
  private async load() {
    this.accept(await this.api.get<OwnView>(`${this.base}/me`));
  }
  async refresh() {
    if (!this.own() || this.busy() || this.loading || this.departed()) return;
    this.loading = true;
    try {
      await this.load();
      if (!this.addingSong()) this.error.set('');
    } catch (error) {
      this.disconnected.set(true);
      this.error.set(this.message(error));
      if (error instanceof HttpErrorResponse && [401, 410].includes(error.status)) {
        this.own.set(null);
        this.memory.forget(this.session);
      }
    } finally {
      this.loading = false;
    }
  }
  private async run(action: () => Promise<void>) {
    if (this.busy() || this.loading) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
    } catch (error) {
      this.error.set(this.message(error));
      if (error instanceof HttpErrorResponse && [401, 410].includes(error.status)) {
        this.own.set(null);
        this.entry.set(null);
        this.memory.forget(this.session);
      }
    } finally {
      this.busy.set(false);
    }
  }
  async join() {
    if (this.joinForm.invalid) return;
    await this.run(async () => {
      const action = async () => {
        await this.api.post(`${this.base}/prepare`, { code: this.code });
        this.accept(
          await this.api.post<OwnView>(`${this.base}/join`, {
            code: this.code,
            ...this.joinForm.getRawValue(),
          }),
        );
      };
      // Serialize initial cookie creation across tabs in browsers supporting Web Locks.
      if (navigator.locks) await navigator.locks.request('singflow-check-in', action);
      else await action();
      this.notifications.success('Entrada confirmada. Sua primeira música já está nos pedidos.');
      afterNextRender(() => this.document.getElementById('participant-status-title')?.focus(), {
        injector: this.injector,
      });
    });
  }
  openSongForm() {
    this.error.set('');
    this.addingSong.set(true);
  }
  closeSongForm() {
    this.addingSong.set(false);
    this.error.set('');
  }
  private update(path: string, body: unknown = {}) {
    const participant = this.own()?.participant.id;
    return this.api.post<OwnView>(
      `${this.base}${path}`,
      body,
      participant ? { 'X-SingFlow-Participant': participant } : {},
    );
  }

  async add() {
    if (this.songForm.invalid || !this.own()) return;
    await this.run(async () => {
      const values = this.songForm.getRawValue();
      const body = JSON.stringify(values);
      if (this.songOperation?.body !== body)
        this.songOperation = { body, operationId: createOperationId() };
      this.accept(
        await this.update(`/requests`, {
          ...values,
          operationId: this.songOperation.operationId,
        }),
      );
      this.songOperation = null;
      this.songForm.reset();
      this.addingSong.set(false);
      this.notifications.success('Música adicionada aos seus pedidos.');
    });
  }
  async cancel(id: string) {
    await this.run(async () => {
      this.accept(await this.update(`/requests/${id}/cancel`));
      this.cancellingSong.set(null);
      this.notifications.success('Pedido cancelado.');
    });
  }
  async respondToCall(call: string, response: 'accept' | 'skip') {
    await this.run(async () => {
      this.accept(await this.update(`/calls/${call}/${response}`));
      this.notifications.success(
        response === 'accept' ? 'Ida confirmada.' : 'Participação pausada.',
      );
    });
  }
  async resume() {
    await this.run(async () => {
      this.accept(await this.update(`/resume`));
      this.notifications.success('Você voltou à fila.');
    });
  }
  async leave() {
    await this.run(async () => {
      this.accept(await this.update(`/leave`));
      this.confirmingExit.set(false);
      this.songForm.reset();
      this.songOperation = null;
      this.notifications.success(
        'Você saiu da fila. Seu histórico e acesso continuam disponíveis.',
      );
    });
  }
  async returnToQueue() {
    if (this.returnForm.invalid || !this.own()?.canReturn) return;
    await this.run(async () => {
      const values = this.returnForm.getRawValue();
      const body = JSON.stringify(values);
      if (this.returnOperation?.body !== body)
        this.returnOperation = { body, operationId: createOperationId() };
      this.accept(
        await this.update(`/return`, {
          ...values,
          operationId: this.returnOperation.operationId,
        }),
      );
      this.returnOperation = null;
      this.returnForm.reset();
      this.notifications.success(
        'Retorno confirmado com nova música e nova chegada. Suas apresentações foram preservadas.',
      );
    });
  }
  async forget() {
    await this.run(async () => {
      await this.update('/forget');
      this.memory.forget(this.session);
      this.own.set(null);
      this.entry.set(null);
      this.departed.set(true);
      this.confirmingForget.set(false);
      this.joinForm.reset();
      this.songForm.reset();
      this.returnForm.reset();
      this.songOperation = null;
      this.returnOperation = null;
    });
  }
  status(value: string) {
    return (
      (
        {
          ACTIVE: 'Participando',
          PAUSED: 'Pausado — fale com o anfitrião para retomar.',
          SUSPENDED: 'Aguardando a rodada dos demais participantes.',
          INACTIVE: 'Inativo por ausência — fale com o anfitrião para retornar.',
          LEFT: 'Fora da fila',
          PENDING: 'Pendente',
          RESERVED: 'Convocada — fale com o anfitrião para alterar.',
          COMPLETED: 'Concluída',
          CANCELLED: 'Cancelada',
          ABSENT: 'Não compareceu',
          DECLINED: 'Desistência temporária',
        } as Record<string, string>
      )[value] ?? value
    );
  }
}
