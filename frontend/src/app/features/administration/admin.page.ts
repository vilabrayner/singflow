import { MenuPopover } from '../../shared/components/menu-popover';
import { PanelWorkspace } from '../../shared/components/panel-workspace';
import { AdminBranding } from './admin-branding';
import { AdminCatalog } from './admin-catalog';
import { afterNextRender, Component, inject, Injector, OnInit, signal } from '@angular/core';
import { DatePipe, DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { AdminSessions } from './admin-sessions';
import { ApiClient, apiError } from '../../core/http/api-client';
import { HostAuth } from '../identity/host-auth';
import { AccountView, accountActive, accountStatus } from '../identity/account-view';
import { PanelHeader } from '../../shared/components/panel-header';
import { StatusBadge } from '../../shared/components/status-badge';
import { SurfaceCard } from '../../shared/components/surface-card';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import { OptionsMenu } from '../../shared/components/options-menu';
import { Notifications } from '../../shared/notifications';

interface Account extends AccountView {
  version: number;
  createdAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
}
interface Event {
  actor: string;
  action: string;
  reason: string;
  occurredAt: string;
}
@Component({
  selector: 'app-admin-page',
  styleUrls: ['../../shared/styles/admin-collections.css', './admin.page.css'],
  imports: [
    PanelHeader,
    MenuPopover,
    PanelWorkspace,
    AdminSessions,
    AdminCatalog,
    AdminBranding,
    SurfaceCard,
    StatusBadge,
    ConfirmationDialog,
    OptionsMenu,
    ReactiveFormsModule,
    InputTextModule,
    DatePipe,
  ],
  templateUrl: './admin.page.html',
})
export class AdminPage implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private revealPage(titleId: string) {
    // Login/logout replace the page body without an Angular route navigation.
    afterNextRender(
      () => {
        this.document.defaultView?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        this.document.getElementById(titleId)?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }
  private readonly auth = inject(HostAuth);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notifications = inject(Notifications);
  readonly showPassword = signal(false);
  readonly headerMenu = signal(false);
  readonly section = signal<'accounts' | 'sessions' | 'catalog' | 'branding'>('accounts');
  readonly navigationItems = [
    { value: 'accounts', label: 'Cadastros', icon: 'fa-solid fa-users' },
    { value: 'sessions', label: 'Sessões', icon: 'fa-solid fa-calendar-days' },
    { value: 'catalog', label: 'Catálogo', icon: 'fa-solid fa-book' },
    { value: 'branding', label: 'Locais e projetos', icon: 'fa-solid fa-location-dot' },
  ];
  readonly catalogVisited = signal(false);
  readonly sessionsVisited = signal(false);
  selectSection(section: string) {
    if (this.busy() || !['accounts', 'sessions', 'catalog', 'branding'].includes(section)) return;
    if (section === 'catalog') this.catalogVisited.set(true);
    if (section === 'sessions') this.sessionsVisited.set(true);
    this.section.set(section as 'accounts' | 'sessions' | 'catalog' | 'branding');
  }
  readonly authorized = signal(false);
  readonly forbidden = signal(false);
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly dialogError = signal('');
  readonly accounts = signal<Account[]>([]);
  readonly total = signal(0);
  readonly page = signal(0);
  readonly selected = signal<Account | null>(null);
  readonly events = signal<Event[]>([]);
  readonly decision = signal('');
  readonly reason = signal('');
  readonly label = accountStatus;
  readonly loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', Validators.required],
  });
  readonly filters = this.fb.group({ search: [''], status: ['PENDING'], role: [''] });
  readonly showingFilters = signal(false);
  readonly filterDraft = this.fb.group({ status: ['PENDING'], role: [''] });
  private readonly appliedFilters = signal({ status: 'PENDING', role: '' });
  filterSummary() {
    const { status, role } = this.appliedFilters();
    const statusLabel =
      (
        {
          PENDING: 'Pendentes',
          APPROVED: 'Aprovados',
          REJECTED: 'Rejeitados',
          SUSPENDED: 'Suspensos',
        } as Record<string, string>
      )[status] ?? 'Todos';
    return (
      statusLabel +
      (role
        ? ' · ' +
          (role === 'HOST' ? 'Anfitriões' : role === 'MUSICIAN' ? 'Músicos' : 'Participantes')
        : '')
    );
  }
  openFilters() {
    if (this.busy()) return;
    this.filterDraft.patchValue(this.appliedFilters());
    this.showingFilters.set(true);
  }
  async applyFilters() {
    if (this.busy()) return;
    const values = this.filterDraft.getRawValue();
    this.filters.patchValue(values);
    this.appliedFilters.set(values);
    this.showingFilters.set(false);
    await this.load(0);
  }
  listStatus(a: Account) {
    if (a.status === 'PENDING') return a.emailVerified ? 'Aguardando aprovação' : 'E-mail pendente';
    return (
      { APPROVED: 'Aprovado', REJECTED: 'Rejeitado', SUSPENDED: 'Acesso suspenso' } as Record<
        string,
        string
      >
    )[a.status];
  }
  async ngOnInit() {
    await this.access();
    this.ready.set(true);
  }
  private async access() {
    try {
      const a = await this.api.get<AccountView>('/auth/me');
      this.authorized.set(!!a.administrator && accountActive(a));
      this.forbidden.set(!this.authorized());
      if (this.authorized()) await this.load(0);
    } catch (error) {
      if (!(error instanceof HttpErrorResponse && error.status === 401))
        this.error.set(apiError(error));
    }
  }
  async login() {
    if (this.busy() || this.loginForm.invalid) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const v = this.loginForm.getRawValue();
      await this.auth.login(v.email, v.password);
      this.loginForm.controls.password.reset();
      this.showPassword.set(false);
    } catch (error) {
      this.error.set(apiError(error));
      return;
    } finally {
      this.busy.set(false);
    }
    await this.access();
    if (this.authorized()) this.revealPage('admin-accounts-title');
  }
  async logout() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.auth.logout();
      this.authorized.set(false);
      this.catalogVisited.set(false);
      this.sessionsVisited.set(false);
      this.section.set('accounts');
      this.showPassword.set(false);
      this.forbidden.set(false);
      this.accounts.set([]);
      this.selected.set(null);
      this.showingFilters.set(false);
      this.revealPage('admin-login-title');
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
  async load(page: number) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const f = this.filters.getRawValue();
      const q = new URLSearchParams({ ...f, page: String(page) });
      const result = await this.api.get<{ items: Account[]; total: number; page: number }>(
        `/admin/accounts?${q}`,
      );
      this.accounts.set(result.items);
      this.total.set(result.total);
      this.page.set(result.page);
    } catch (error) {
      this.error.set(apiError(error));
      if (error instanceof HttpErrorResponse && [401, 403].includes(error.status)) {
        this.authorized.set(false);
        this.catalogVisited.set(false);
        this.sessionsVisited.set(false);
        this.section.set('accounts');
        this.forbidden.set(true);
        this.selected.set(null);
        this.accounts.set([]);
      }
    } finally {
      this.busy.set(false);
    }
  }
  async open(a: Account) {
    this.selected.set(a);
    this.decision.set('');
    this.dialogError.set('');
    this.events.set([]);
    try {
      this.events.set(
        await this.api.get<Event[]>(`/admin/accounts/history?email=${encodeURIComponent(a.email)}`),
      );
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
    }
  }
  actions(a: Account) {
    return [
      {
        label: a.status === 'SUSPENDED' ? 'Reativar cadastro' : 'Aprovar cadastro',
        icon: 'fa-solid fa-check',
        disabled: !a.emailVerified || a.status === 'APPROVED',
        command: () => this.ask('APPROVED'),
      },
      {
        label: 'Rejeitar cadastro',
        icon: 'fa-solid fa-xmark',
        disabled: a.status !== 'PENDING',
        command: () => this.ask('REJECTED'),
      },
      {
        label: 'Suspender acesso',
        icon: 'fa-solid fa-pause',
        disabled: a.status !== 'APPROVED',
        command: () => this.ask('SUSPENDED'),
      },
    ];
  }
  ask(status: string) {
    this.reason.set('');
    this.dialogError.set('');
    this.decision.set(status);
  }
  decisionTitle() {
    return this.decision() === 'APPROVED'
      ? 'Confirmar aprovação'
      : this.decision() === 'REJECTED'
        ? 'Confirmar rejeição'
        : 'Confirmar suspensão';
  }
  dismiss() {
    if (this.busy()) return;
    if (this.decision()) this.decision.set('');
    else this.selected.set(null);
  }
  async confirm() {
    if (this.busy() || !this.selected()) return;
    this.busy.set(true);
    this.dialogError.set('');
    let succeeded = false;
    try {
      const a = this.selected()!;
      await this.api.post('/admin/accounts/decision', {
        email: a.email,
        status: this.decision(),
        reason: this.reason(),
        version: a.version,
      });
      this.selected.set(null);
      this.decision.set('');
      this.notifications.success('Cadastro atualizado.');
      succeeded = true;
    } catch (error) {
      this.dialogError.set(
        error instanceof HttpErrorResponse && [400, 409].includes(error.status)
          ? (error.error?.detail ?? apiError(error))
          : apiError(error),
      );
    } finally {
      this.busy.set(false);
    }
    if (succeeded) await this.load(this.page());
  }
  eventLabel(action: string) {
    return (
      (
        {
          REGISTERED: 'Cadastro recebido',
          VERIFICATION_SENT: 'Confirmação enviada',
          EMAIL_VERIFIED: 'E-mail confirmado',
          APPROVED: 'Aprovado',
          REJECTED: 'Rejeitado',
          SUSPENDED: 'Suspenso',
          ADMIN_GRANTED: 'Permissão administrativa concedida',
        } as Record<string, string>
      )[action] ?? action
    );
  }
}
