import { InputInteraction } from '../../shared/input-interaction';
import { ScrollArea, ScrollAreaModule } from 'primeng/scrollarea';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { BottomNavigation, BottomNavigationItem } from '../../shared/components/bottom-navigation';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { createOperationId } from '../../shared/operation-id';
import { Notifications } from '../../shared/notifications';
import { SessionMusicians } from '../musicians/session-musicians';
import { MenuPopover } from '../../shared/components/menu-popover';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  inject,
  Injector,
  OnInit,
  ElementRef,
  viewChild,
  signal,
} from '@angular/core';
import { EntryShare } from '../participation/entry-share';
import { StagePanel } from '../stage/stage-panel';
import { HostParticipants } from '../participants/host-participants';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { PanelHeader } from '../../shared/components/panel-header';
import { SurfaceCard } from '../../shared/components/surface-card';
import { StatusBadge } from '../../shared/components/status-badge';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { InputTextModule } from 'primeng/inputtext';
import { HostAuth } from '../identity/host-auth';
import { SessionApi, KaraokeSession, Participant } from './session-api';
import { apiError } from '../../core/http/api-client';

@Component({
  selector: 'app-host-dashboard',
  imports: [
    NgTemplateOutlet,
    ScrollAreaModule,
    CdkScrollable,
    BottomNavigation,
    RouterLink,
    ConfirmationDialog,
    MenuPopover,
    SessionMusicians,
    ReactiveFormsModule,
    InputTextModule,
    StagePanel,
    HostParticipants,
    EntryShare,
    PanelHeader,
    SurfaceCard,
    StatusBadge,
  ],
  templateUrl: './host-dashboard.html',
})
export class HostDashboard implements OnInit {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly auth = inject(HostAuth);
  private readonly api = inject(SessionApi);
  private readonly route = inject(ActivatedRoute);
  readonly interaction = inject(InputInteraction);
  readonly registeringParticipant = signal(false);
  readonly activeTab = signal('queue');
  readonly dockHeight = signal(64);
  private readonly tabViewport = viewChild('tabViewport', {
    read: ElementRef,
  });
  private readonly scrollArea = viewChild(ScrollArea);
  private tabScroll: Record<string, number> = {};
  readonly tabContentLabel = computed(
    () =>
      ({
        queue: 'Conteúdo da fila',
        participants: 'Conteúdo dos participantes',
        history: 'Conteúdo do histórico',
        musicians: 'Conteúdo dos músicos',
      })[this.activeTab() as 'queue' | 'participants' | 'history' | 'musicians'],
  );

  readonly navigationItems: BottomNavigationItem[] = [
    { value: 'queue', label: 'Fila', icon: 'fa-solid fa-list-ol' },
    { value: 'participants', label: 'Participantes', icon: 'fa-solid fa-users' },
    { value: 'history', label: 'Histórico', icon: 'fa-solid fa-clock-rotate-left' },
    { value: 'musicians', label: 'Músicos', icon: 'fa-solid fa-guitar' },
  ];
  changeTab(value: string) {
    if (this.locked() || !this.navigationItems.some((item) => item.value === value)) return;
    if (value === this.activeTab()) return;
    const viewport = this.tabViewport()?.nativeElement;
    if (viewport) this.tabScroll[this.activeTab()] = viewport.scrollTop;
    this.activeTab.set(value);
    afterNextRender(
      () => {
        this.scrollArea()?.refresh();
        this.tabViewport()?.nativeElement.scrollTo({
          top: this.tabScroll[value] ?? 0,
          behavior: 'instant',
        });
      },
      { injector: this.injector },
    );
  }
  participantRegistered() {
    // A successful save may still be refreshing data; navigation must not be
    // rejected by that temporary busy state.
    this.registeringParticipant.set(false);
    this.activeTab.set('queue');
    this.tabScroll['queue'] = 0;
    afterNextRender(
      () => {
        this.document.defaultView?.scrollTo({ top: 0, behavior: 'instant' });
        this.scrollArea()?.refresh();
        this.tabViewport()?.nativeElement.scrollTo({ top: 0, behavior: 'instant' });
        this.interaction.focus(this.document.getElementById('host-content'));
      },
      { injector: this.injector },
    );
  }
  readonly participantBusy = signal(false);
  readonly stageBusy = signal(false);
  readonly locked = computed(() => this.busy() || this.participantBusy() || this.stageBusy());
  readonly creatingSession = signal(false);
  readonly showPassword = signal(false);
  readonly accountOptions = signal(false);
  readonly choosingSession = signal(false);
  readonly accountSessionStatus = signal<KaraokeSession['status']>('OPEN');
  private previousSession: KaraokeSession | null = null;
  readonly stageRevision = signal(0);
  readonly ready = signal(false);
  readonly email = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  private readonly notifications = inject(Notifications);
  readonly sessions = signal<KaraokeSession[]>([]);
  readonly accountSessions = computed(() =>
    this.sessions().filter((session) => session.status === this.accountSessionStatus()),
  );
  readonly hasSessionHistory = computed(() =>
    this.sessions().some((session) => session.status === 'CLOSED'),
  );
  readonly hasDrafts = computed(() =>
    this.sessions().some((session) => session.status === 'DRAFT'),
  );
  readonly accountSessionTitle = computed(
    () =>
      ({
        OPEN: 'Sessões abertas',
        CLOSED: 'Histórico de sessões',
        DRAFT: 'Rascunhos',
      })[this.accountSessionStatus()],
  );
  readonly selected = signal<KaraokeSession | null>(null);
  readonly participants = signal<Participant[]>([]);
  readonly requests = signal<import('./session-api').SongRequest[]>([]);
  readonly confirmingClose = signal(false);
  readonly loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  readonly sessionForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
  });
  private createKey = createOperationId();

  constructor() {
    effect((onCleanup) => {
      const session = this.selected();
      if (session?.status !== 'OPEN' || this.participants().length) return;

      let checking = false;
      let cancelled = false;
      const timer = setInterval(async () => {
        if (checking || this.locked() || this.creatingSession() || this.document.hidden) return;
        checking = true;
        try {
          const people = await this.api.participants(session.id);
          if (!cancelled && people.length && !this.locked() && !this.creatingSession()) {
            await this.refresh();
          }
        } catch {
          // Retry the background check on the next interval.
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

  async ngOnInit() {
    try {
      this.email.set((await this.auth.me()).email);
      await this.loadSessions();
      await this.selectInitialSession();
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
    this.tabScroll = {};
    this.activeTab.set('queue');
    this.participantBusy.set(false);
    this.stageBusy.set(false);
    this.selected.set(null);
    this.participants.set([]);
    this.requests.set([]);
    this.confirmingClose.set(false);
    this.accountOptions.set(false);
    this.creatingSession.set(false);
    this.showPassword.set(false);
    this.previousSession = null;
  }
  private async loadSessions() {
    this.sessions.set(await this.api.list());
  }
  private focus(id: string) {
    afterNextRender(() => this.interaction.focus(this.document.getElementById(id)), {
      injector: this.injector,
    });
  }
  private async selectInitialSession() {
    const requested = this.route.snapshot.queryParamMap.get('sessao');
    if (requested) {
      const target = this.sessions().find((s) => s.id === requested);
      if (!target) {
        this.error.set('Sessão indisponível para esta conta.');
        return;
      }
      await this.loadSession(target);
      return;
    }
    const session =
      this.sessions().find((s) => s.status === 'OPEN') ??
      this.sessions().find((s) => s.status === 'DRAFT');
    if (session) await this.loadSession(session);
  }
  toggleAccount() {
    if (this.accountOptions()) {
      this.accountOptions.set(false);
    } else {
      this.choosingSession.set(false);
      this.accountSessionStatus.set('OPEN');
      this.accountOptions.set(true);
    }
  }
  showAccountSessions(status: KaraokeSession['status']) {
    this.choosingSession.set(true);
    this.accountSessionStatus.set(status);
    this.accountOptions.set(true);
    this.focus('account-session-title');
  }
  dismissAccount() {
    this.accountOptions.set(false);
    this.focus('account-options-button');
  }
  refreshFromMenu() {
    this.accountOptions.set(false);
    void this.refresh();
  }
  askClose() {
    this.accountOptions.set(false);
    this.confirmingClose.set(true);
  }
  cancelClose() {
    this.confirmingClose.set(false);
    this.focus('account-options-button');
  }
  beginCreate() {
    this.previousSession = this.selected();
    this.creatingSession.set(true);
    this.accountOptions.set(false);
    this.focus('session-name');
  }
  cancelCreate() {
    this.creatingSession.set(false);
    this.sessionForm.reset();
    this.focus(this.previousSession ? 'host-session-title' : 'start-session');
    this.previousSession = null;
  }
  sessionStatus(status: KaraokeSession['status']) {
    return { DRAFT: 'Rascunho', OPEN: 'Aberta', CLOSED: 'Encerrada' }[status];
  }
  async login() {
    if (this.loginForm.invalid) return;
    await this.run(async () => {
      const form = this.loginForm.getRawValue();
      await this.auth.login(form.email, form.password);
      this.loginForm.controls.password.reset();
      this.email.set((await this.auth.me()).email);
      await this.loadSessions();
      await this.selectInitialSession();
      this.focus(this.selected() ? 'host-session-title' : 'start-session');
    });
  }
  async logout() {
    await this.run(async () => {
      await this.auth.logout();
      this.email.set('');
      this.sessions.set([]);
      this.clearSession();
      this.focus('login-email');
    });
  }
  async create() {
    if (this.sessionForm.invalid) return;
    await this.run(async () => {
      const session = await this.api.create(this.sessionForm.controls.name.value, this.createKey);
      this.createKey = createOperationId();
      this.sessionForm.reset();
      await this.loadSessions();
      await this.loadSession(session);
      this.creatingSession.set(false);
      this.previousSession = null;
      this.focus('host-session-title');
      this.notifications.success('Sessão criada. Abra para receber participantes.');
    });
  }
  private async loadSession(session: KaraokeSession) {
    if (session.id !== this.selected()?.id) {
      this.activeTab.set('queue');
      this.tabScroll = {};
      afterNextRender(
        () => this.tabViewport()?.nativeElement.scrollTo({ top: 0, behavior: 'instant' }),
        { injector: this.injector },
      );
    }
    const [participants, requests] = await Promise.all([
      this.api.participants(session.id),
      this.api.requests(session.id),
    ]);
    this.selected.set(session);
    this.participants.set(participants);
    this.requests.set(requests);
    this.confirmingClose.set(false);
    this.stageRevision.update((value) => value + 1);
  }
  async select(session: KaraokeSession) {
    await this.run(async () => {
      if (this.selected()?.id !== session.id) this.activeTab.set('queue');
      await this.loadSession(session);
      this.creatingSession.set(false);
      this.accountOptions.set(false);
      this.focus('host-session-title');
    });
  }
  async refresh() {
    await this.run(async () => {
      const id = this.selected()?.id;
      await this.loadSessions();
      const session = this.sessions().find((s) => s.id === id);
      if (session) await this.loadSession(session);
      else this.clearSession();
    });
  }
  async transition(action: 'open' | 'close') {
    const session = this.selected();
    if (!session) return;
    await this.run(async () => {
      const updated = await this.api.transition(session.id, action);
      if (action === 'close') {
        // Keep the confirmed state even if a subsequent read fails.
        this.selected.set(updated);
        this.sessions.update((items) =>
          items.map((item) => (item.id === updated.id ? updated : item)),
        );
        this.confirmingClose.set(false);
        this.notifications.success('Sessão encerrada.');
        try {
          await this.loadSessions();
          const next = this.sessions().find(
            (item) => item.id !== updated.id && item.status === 'OPEN',
          );
          this.clearSession();
          if (next) await this.loadSession(next);
        } finally {
          this.focus(this.selected() ? 'host-session-title' : 'start-session');
        }
        return;
      }
      await this.loadSessions();
      await this.loadSession(updated);
      this.focus('host-session-title');
      this.notifications.success('Sessão aberta.');
    });
  }
}
