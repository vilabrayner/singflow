import { Router } from '@angular/router';
import {
  afterNextRender,
  Component,
  computed,
  inject,
  Injector,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MenuItem } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { ApiClient, apiError } from '../../core/http/api-client';
import { HostAuth } from '../identity/host-auth';
import { KaraokeSession } from '../sessions/session-api';
import { StageView, callStatus } from '../stage/stage-api';
import { PanelHeader } from '../../shared/components/panel-header';
import { OptionsMenu } from '../../shared/components/options-menu';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import { SurfaceCard } from '../../shared/components/surface-card';
import { StatusBadge } from '../../shared/components/status-badge';
import { Notifications } from '../../shared/notifications';

interface Performance {
  session: KaraokeSession;
  stage: StageView;
}
@Component({
  selector: 'app-musician-page',
  styles:
    ':host { display: block; } .sf-musician-archive-section { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--sf-border); }',
  imports: [
    PanelHeader,
    OptionsMenu,
    ConfirmationDialog,
    SurfaceCard,
    StatusBadge,
    ReactiveFormsModule,
    InputTextModule,
    DatePipe,
  ],
  templateUrl: './musician.page.html',
})
export class MusicianPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiClient);
  private readonly injector = inject(Injector);
  private readonly sessionDialog = viewChild<ConfirmationDialog>('sessionDialog');
  private readonly auth = inject(HostAuth);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly document = inject(DOCUMENT);
  private readonly notifications = inject(Notifications);
  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', Validators.required],
  });
  private readonly router = inject(Router);
  readonly showPassword = signal(false);
  readonly email = signal('');
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly disconnected = signal(false);
  readonly sessions = signal<KaraokeSession[]>([]);
  readonly selected = signal<KaraokeSession | null>(null);
  readonly performance = signal<Performance | null>(null);
  readonly choosingSession = signal(false);
  readonly openSessions = computed(() => this.sessions().filter((s) => s.status === 'OPEN'));
  readonly pastSessions = computed(() => this.sessions().filter((s) => s.status === 'CLOSED'));
  readonly archiveSession = signal<KaraokeSession | null>(null);
  readonly archivePerformance = signal<Performance | null>(null);
  readonly archiveLoading = signal(false);
  readonly archiveError = signal('');
  readonly chooserReturnFocus = signal('musician-options');
  readonly archiveMenu: MenuItem[] = [
    { label: 'Atualizar consulta', icon: 'pi pi-refresh', command: () => void this.loadArchive() },
  ];
  private archiveGeneration = 0;
  readonly showingHistory = signal(false);
  readonly search = signal('');
  readonly updatedAt = signal<Date | null>(null);
  readonly labels = callStatus;
  readonly locked = computed(() => this.busy() || this.loading());
  readonly queue = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return (this.performance()?.stage.suggestions ?? []).filter((p) =>
      `${p.name} ${p.title ?? ''} ${p.artist ?? ''}`.toLocaleLowerCase().includes(query),
    );
  });
  readonly menu = computed<MenuItem[]>(() => [
    { label: 'Atualizar', icon: 'pi pi-refresh', command: () => void this.load() },
    { label: 'Trocar sessão', icon: 'pi pi-list', command: () => this.openChooser() },
    {
      label: 'Histórico do palco',
      icon: 'pi pi-history',
      disabled: !this.performance(),
      command: () => this.showingHistory.set(true),
    },
    { label: 'Sair da conta', icon: 'pi pi-sign-out', command: () => void this.logout() },
  ]);
  private timer?: ReturnType<typeof setInterval>;
  private generation = 0;
  private destroyed = false;

  async ngOnInit() {
    try {
      const account = await this.auth.account();
      this.email.set(account.email);
      await this.load();
    } catch (error) {
      if (!(error instanceof HttpErrorResponse && error.status === 401))
        this.error.set(apiError(error));
    } finally {
      this.ready.set(true);
    }
    if (this.destroyed) return;
    this.timer = setInterval(() => {
      if (!this.document.hidden && this.email()) void this.load();
    }, 4000);
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.generation++;
    this.archiveGeneration++;
    clearInterval(this.timer);
  }
  toggleRegistration() {
    void this.router.navigateByUrl('/cadastro/musico');
  }
  async login() {
    if (this.form.invalid || this.locked()) return;
    const { email, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(email, password);
      const account = await this.auth.account();
      this.email.set(account.email);
      this.form.controls.password.reset();
      this.showPassword.set(false);
      await this.load();
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 401
          ? 'E-mail ou senha inválidos.'
          : error instanceof HttpErrorResponse && error.status === 400
            ? (error.error?.detail ?? 'Confira o e-mail e a senha.')
            : apiError(error),
      );
    } finally {
      this.busy.set(false);
    }
  }
  async load(preferred = this.selected()?.id) {
    if (this.loading() || this.destroyed) return;
    this.loading.set(true);
    const generation = ++this.generation;
    try {
      const sessions = await this.api.get<KaraokeSession[]>('/musicians/sessions');
      if (generation !== this.generation || this.destroyed) return;
      this.sessions.set(sessions);
      if (
        this.archiveSession() &&
        !sessions.some((s) => s.id === this.archiveSession()!.id && s.status === 'CLOSED')
      ) {
        this.backToSessions();
        this.archiveError.set('Esta sessão não está mais disponível para sua conta.');
      }
      const selected =
        sessions.find((s) => s.id === preferred && s.status === 'OPEN') ??
        sessions.find((s) => s.status === 'OPEN') ??
        null;
      if (selected?.id !== this.selected()?.id) {
        this.performance.set(null);
        this.search.set('');
        this.showingHistory.set(false);
      }
      this.selected.set(selected);
      if (selected) {
        const performance = await this.api.get<Performance>(`/musicians/sessions/${selected.id}`);
        if (generation !== this.generation || this.destroyed) return;
        if (performance.session.status === 'OPEN') {
          this.performance.set(performance);
          this.selected.set(performance.session);
        } else {
          // The host may close the session between the list request and the snapshot.
          this.selected.set(null);
          this.performance.set(null);
          this.showingHistory.set(false);
          this.sessions.update((list) =>
            list.map((s) => (s.id === performance.session.id ? performance.session : s)),
          );
        }
      } else {
        this.performance.set(null);
      }
      this.error.set('');
      this.disconnected.set(false);
      this.updatedAt.set(new Date());
    } catch (error) {
      this.error.set(apiError(error));
      this.disconnected.set(true);
      if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status)) {
        this.performance.set(null);
        this.selected.set(null);
        this.showingHistory.set(false);
        if ([401, 403].includes(error.status)) {
          this.backToSessions();
          this.archiveError.set(
            'Acesso indisponível. Entre novamente para consultar suas sessões.',
          );
          this.sessions.set([]);
        }
        if (error.status === 401) {
          this.email.set('');
          this.sessions.set([]);
          this.choosingSession.set(false);
        }
      }
    } finally {
      this.loading.set(false);
    }
  }
  openChooser(returnFocus = 'musician-options') {
    this.chooserReturnFocus.set(returnFocus);
    this.backToSessions();
    this.choosingSession.set(true);
  }
  private focusSessionTitle() {
    if (this.choosingSession())
      afterNextRender(() => this.sessionDialog()?.focusTitle(), { injector: this.injector });
  }
  backToSessions() {
    this.archiveGeneration++;
    this.archiveSession.set(null);
    this.archivePerformance.set(null);
    this.archiveLoading.set(false);
    this.archiveError.set('');
    this.focusSessionTitle();
  }
  closeChooser() {
    this.choosingSession.set(false);
    this.backToSessions();
  }
  dismissChooser() {
    if (this.archiveSession()) this.backToSessions();
    else this.closeChooser();
  }
  async select(session: KaraokeSession) {
    if (this.locked()) return;
    if (session.status === 'CLOSED') {
      this.archiveGeneration++;
      this.archiveSession.set(session);
      this.archivePerformance.set(null);
      this.archiveLoading.set(false);
      this.archiveError.set('');
      this.focusSessionTitle();
      await this.loadArchive();
      return;
    }
    if (session.status !== 'OPEN') return;
    this.closeChooser();
    await this.load(session.id);
  }
  async loadArchive() {
    const session = this.archiveSession();
    if (!session || this.archiveLoading() || this.destroyed) return;
    const generation = this.archiveGeneration;
    this.archiveLoading.set(true);
    this.archiveError.set('');
    try {
      const performance = await this.api.get<Performance>(`/musicians/sessions/${session.id}`);
      if (this.destroyed || generation !== this.archiveGeneration || !this.choosingSession())
        return;
      if (performance.session.status !== 'CLOSED') {
        this.backToSessions();
        this.archiveError.set('A situação desta sessão mudou. Escolha novamente na lista.');
        return;
      }
      this.archiveSession.set(performance.session);
      this.archivePerformance.set(performance);
    } catch (error) {
      if (this.destroyed || generation !== this.archiveGeneration || !this.choosingSession())
        return;
      this.archivePerformance.set(null);
      this.archiveError.set(apiError(error));
    } finally {
      if (!this.destroyed && generation === this.archiveGeneration) this.archiveLoading.set(false);
    }
  }
  async logout() {
    if (this.locked()) return;
    this.busy.set(true);
    try {
      await this.auth.logout();
      this.generation++;
      this.email.set('');
      this.sessions.set([]);
      this.selected.set(null);
      this.performance.set(null);
      this.showingHistory.set(false);
      this.closeChooser();
      this.error.set('');
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
