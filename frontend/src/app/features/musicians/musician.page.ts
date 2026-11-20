import { AdminCatalog } from '../administration/admin-catalog';
import { accountHasRole } from '../identity/account-view';
import { PanelSwitcher } from '../../shared/components/panel-switcher';
import { Realtime } from '../../core/realtime/realtime';
import { StreamingLink } from '../../shared/streaming';
import { ChordActions } from '../../shared/components/chord-actions';
import { ChordLinkDialog, ChordLink, ChordSong } from '../../shared/components/chord-link-dialog';
import { Notifications } from '../../shared/notifications';
import { PanelWorkspace } from '../../shared/components/panel-workspace';
import { MenuPopover } from '../../shared/components/menu-popover';
import { StageQueue } from '../stage/stage-queue';
import { StageHistory } from '../stage/stage-history';
import { Router } from '@angular/router';
import {
  afterNextRender,
  Component,
  computed,
  effect,
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
import { InputTextModule } from 'primeng/inputtext';
import { ApiClient, apiError } from '../../core/http/api-client';
import { HostAuth } from '../identity/host-auth';
import { KaraokeSession } from '../sessions/session-api';
import { StageView, StageCall } from '../stage/stage-api';
import { PanelHeader } from '../../shared/components/panel-header';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import { SurfaceCard } from '../../shared/components/surface-card';
import { StatusBadge } from '../../shared/components/status-badge';

interface Performance {
  session: KaraokeSession;
  stage: StageView;
  chords?: Record<string, ChordLink>;
  streaming?: Record<string, StreamingLink[]>;
}
@Component({
  selector: 'app-musician-page',
  styleUrl: '../../shared/styles/admin-collections.css',
  styles:
    ':host { display:block; } .sf-musician-archive-section { margin-top:20px; padding-top:20px; border-top:1px solid var(--sf-border); }',
  imports: [
    AdminCatalog,
    ChordActions,
    ChordLinkDialog,
    PanelSwitcher,
    PanelHeader,
    PanelWorkspace,
    MenuPopover,
    StageQueue,
    StageHistory,
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
  private readonly notifications = inject(Notifications);
  private readonly injector = inject(Injector);
  private readonly sessionDialog = viewChild<ConfirmationDialog>('sessionDialog');
  private readonly auth = inject(HostAuth);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly document = inject(DOCUMENT);
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
  private archiveGeneration = 0;
  readonly headerMenu = signal(false);
  readonly activeTab = signal('stage');
  readonly navigationItems = [
    { value: 'stage', label: 'Palco', icon: 'fa-solid fa-bullhorn' },
    { value: 'queue', label: 'Fila', icon: 'fa-solid fa-list-ol' },
    { value: 'history', label: 'Histórico', icon: 'fa-solid fa-clock-rotate-left' },
  ];
  changeTab(value: string) {
    if (this.navigationItems.some((item) => item.value === value)) this.activeTab.set(value);
  }
  readonly choosingChord = signal<{ song: ChordSong; session: string } | null>(null);
  openChord(song: ChordSong, session = this.selected()?.id) {
    if (!session || !this.canRecordKey()) return;
    this.choosingChord.set({ song, session });
  }
  chordSaved(link: ChordLink) {
    const session = this.choosingChord()?.session;
    if (this.selected()?.id === session)
      this.performance.update((p) =>
        p ? { ...p, chords: { ...p.chords, [link.songId]: link } } : p,
      );
    if (this.archiveSession()?.id === session)
      this.archivePerformance.update((p) =>
        p ? { ...p, chords: { ...p.chords, [link.songId]: link } } : p,
      );
  }
  readonly canRecordKey = signal(false);
  readonly canEditCatalog = signal(false);
  readonly editingSong = signal<string | null>(null);
  editSong(id: string | null | undefined) {
    if (id && this.canEditCatalog()) this.editingSong.set(id);
  }
  catalogSaved() {
    void this.load(undefined, true);
  }
  readonly editingKey = signal<{ session: string; call: StageCall } | null>(null);
  readonly keyError = signal('');
  readonly keyForm = this.fb.control('', [
    Validators.pattern(/^[A-G](#|b)?m?$/),
    Validators.maxLength(4),
  ]);
  openKey(call: StageCall, session = this.selected()?.id) {
    if (!session || this.busy() || !this.canRecordKey()) return;
    this.keyError.set('');
    this.keyForm.setValue(call.performedKey ?? '');
    this.editingKey.set({ session, call: { ...call } });
  }
  async saveKey() {
    const editing = this.editingKey();
    if (!editing || this.busy() || this.keyForm.invalid) return;
    this.busy.set(true);
    this.keyError.set('');
    // Discard any in-flight polling snapshot started before this update.
    this.generation++;
    this.archiveGeneration++;
    this.archiveLoading.set(false);
    try {
      const result = await this.api.post<Performance>(
        `/musicians/sessions/${editing.session}/calls/${editing.call.id}/key`,
        { version: editing.call.keyVersion ?? 0, performedKey: this.keyForm.value || null },
      );
      if (this.selected()?.id === editing.session) this.performance.set(result);
      if (this.archiveSession()?.id === editing.session) this.archivePerformance.set(result);
      this.editingKey.set(null);
      this.notifications.success('Tom cantado atualizado.');
    } catch (error) {
      this.keyError.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? 'Sessão indisponível para este músico.'
          : apiError(error),
      );
    } finally {
      this.busy.set(false);
    }
  }
  readonly updatedAt = signal<Date | null>(null);
  readonly locked = computed(() => this.busy() || this.loading());
  readonly pullRefresh = () => this.load(undefined, true);
  private readonly realtime = inject(Realtime);
  constructor() {
    effect((onCleanup) => {
      if (!this.email() || !this.ready()) return;
      onCleanup(
        this.realtime.watch({
          path: '/realtime/tickets',
          body: { perspective: 'musician' },
          update: () => this.load(undefined, true),
          blocked: () =>
            this.locked() || !!this.editingKey() || !!this.choosingChord() || !!this.editingSong(),
        }),
      );
    });
  }
  private generation = 0;
  private destroyed = false;

  async ngOnInit() {
    try {
      const account = await this.auth.account();
      this.email.set(account.email);
      this.canRecordKey.set(accountHasRole(account, 'MUSICIAN'));
      this.canEditCatalog.set(!!account.administrator);
      await this.load();
    } catch (error) {
      if (!(error instanceof HttpErrorResponse && error.status === 401))
        this.error.set(apiError(error));
    } finally {
      this.ready.set(true);
    }
    if (this.destroyed) return;
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.generation++;
    this.archiveGeneration++;
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
      this.canRecordKey.set(accountHasRole(account, 'MUSICIAN'));
      this.canEditCatalog.set(!!account.administrator);
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
  async load(preferred = this.selected()?.id, background = false) {
    if (this.loading() || (this.editingKey() && this.busy()) || this.destroyed) return;
    this.loading.set(true);
    const generation = ++this.generation;
    try {
      const sessions = await this.api.get<KaraokeSession[]>('/musicians/sessions', { background });
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
        this.activeTab.set('stage');
      }
      this.selected.set(selected);
      if (selected) {
        const performance = await this.api.get<Performance>(`/musicians/sessions/${selected.id}`, {
          background,
        });
        if (generation !== this.generation || this.destroyed) return;
        if (performance.session.status === 'OPEN') {
          this.performance.set(performance);
          this.selected.set(performance.session);
        } else {
          // The host may close the session between the list request and the snapshot.
          this.selected.set(null);
          this.performance.set(null);
          this.activeTab.set('stage');
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
        this.choosingChord.set(null);
        this.performance.set(null);
        this.selected.set(null);
        this.activeTab.set('stage');
        if ([401, 403].includes(error.status)) {
          this.backToSessions();
          this.archiveError.set(
            'Acesso indisponível. Entre novamente para consultar suas sessões.',
          );
          this.sessions.set([]);
        }
        if (error.status === 401) {
          this.headerMenu.set(false);
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
      this.headerMenu.set(false);
      this.email.set('');
      this.choosingChord.set(null);
      this.sessions.set([]);
      this.selected.set(null);
      this.performance.set(null);
      this.activeTab.set('stage');
      this.closeChooser();
      this.error.set('');
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
