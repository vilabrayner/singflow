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
    AdminSessions,
    AdminCatalog,
    SurfaceCard,
    StatusBadge,
    ConfirmationDialog,
    OptionsMenu,
    ReactiveFormsModule,
    InputTextModule,
    DatePipe,
  ],
  template: `
    <app-panel-header>
      @if (authorized()) {
        <button
          type="button"
          class="sf-icon-button"
          aria-label="Sair da conta"
          title="Sair da conta"
          [disabled]="busy()"
          (click)="logout()"
        >
          <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
        </button>
      }
    </app-panel-header>
    <main class="sf-host-shell">
      @if (error()) {
        <p class="sf-dialog-error" role="alert">{{ error() }}</p>
      }
      @if (!ready()) {
        <p role="status">Carregando acesso…</p>
      } @else if (!authorized()) {
        <div class="sf-centered-state">
          <app-surface-card labelledBy="admin-login-title">
            <span class="sf-card-icon" aria-hidden="true"
              ><i class="fa-solid fa-shield-halved"></i
            ></span>
            <h1 id="admin-login-title" tabindex="-1">Entrar como administrador</h1>
            @if (forbidden()) {
              <p role="alert">Esta conta não possui acesso administrativo.</p>
              <button class="sf-button sf-outline sf-full" [disabled]="busy()" (click)="logout()">
                Sair da conta
              </button>
            } @else {
              <p>Entre na sua conta para gerenciar os cadastros do SingFlow.</p>
              <form class="host-form" [formGroup]="loginForm" (ngSubmit)="login()">
                <label for="admin-login-email">E-mail</label>
                <input
                  id="admin-login-email"
                  pInputText
                  type="email"
                  formControlName="email"
                  autocomplete="username"
                  maxlength="254"
                  required
                  [readOnly]="busy()"
                  [attr.aria-invalid]="
                    loginForm.controls.email.touched && loginForm.controls.email.invalid
                  "
                  [attr.aria-describedby]="
                    loginForm.controls.email.touched && loginForm.controls.email.invalid
                      ? 'admin-email-error'
                      : null
                  "
                />
                @if (loginForm.controls.email.touched && loginForm.controls.email.invalid) {
                  <p id="admin-email-error" class="sf-field-error">Informe um e-mail válido.</p>
                }
                <label for="admin-login-password">Senha</label>
                <div class="sf-password-field">
                  <input
                    id="admin-login-password"
                    pInputText
                    [type]="showPassword() ? 'text' : 'password'"
                    formControlName="password"
                    autocomplete="current-password"
                    required
                    [readOnly]="busy()"
                  />
                  <button
                    type="button"
                    class="sf-icon-button"
                    [attr.aria-label]="showPassword() ? 'Ocultar senha' : 'Mostrar senha'"
                    [attr.aria-pressed]="showPassword()"
                    [disabled]="busy()"
                    (click)="showPassword.set(!showPassword())"
                  >
                    <i
                      [class]="showPassword() ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"
                      aria-hidden="true"
                    ></i>
                  </button>
                </div>
                <button
                  type="submit"
                  class="sf-button sf-primary sf-full"
                  [disabled]="busy() || loginForm.invalid"
                >
                  @if (busy()) {
                    <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                  }
                  Entrar
                </button>
              </form>
            }
          </app-surface-card>
        </div>
      } @else {
        <nav class="admin-sections" aria-label="Áreas da administração">
          <button
            type="button"
            class="sf-button"
            [class.sf-primary]="section() === 'accounts'"
            [class.sf-outline]="section() !== 'accounts'"
            [attr.aria-current]="section() === 'accounts' ? 'page' : null"
            [disabled]="busy()"
            (click)="selectSection('accounts')"
          >
            Cadastros
          </button>
          <button
            type="button"
            class="sf-button"
            [class.sf-primary]="section() === 'sessions'"
            [class.sf-outline]="section() !== 'sessions'"
            [attr.aria-current]="section() === 'sessions' ? 'page' : null"
            [disabled]="busy()"
            (click)="selectSection('sessions')"
          >
            Sessões abertas
          </button>
          <button
            type="button"
            class="sf-button"
            [class.sf-primary]="section() === 'catalog'"
            [class.sf-outline]="section() !== 'catalog'"
            [attr.aria-current]="section() === 'catalog' ? 'page' : null"
            [disabled]="busy()"
            (click)="selectSection('catalog')"
          >
            Catálogo
          </button>
        </nav>
        @if (section() === 'catalog') {
          <app-admin-catalog />
        } @else if (section() === 'sessions') {
          <app-admin-sessions />
        } @else {
          <app-surface-card labelledBy="admin-accounts-title">
            <div class="admin-card-heading">
              <h1 id="admin-accounts-title" tabindex="-1">Cadastros</h1>
              <button
                type="button"
                class="sf-icon-button"
                aria-label="Atualizar cadastros"
                title="Atualizar cadastros"
                [disabled]="busy()"
                (click)="load(page())"
              >
                <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
              </button>
            </div>
            <p class="admin-intro">Acompanhe e libere os acessos ao SingFlow.</p>
            <form class="admin-search host-form" [formGroup]="filters" (ngSubmit)="load(0)">
              <label for="admin-account-search">Buscar cadastro</label>
              <div class="admin-search-controls">
                <input
                  id="admin-account-search"
                  pInputText
                  formControlName="search"
                  maxlength="120"
                  placeholder="Nome ou e-mail"
                  [readOnly]="busy()"
                />
                <button
                  type="submit"
                  class="sf-icon-button"
                  aria-label="Buscar cadastros"
                  title="Buscar cadastros"
                  [disabled]="busy()"
                >
                  <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                </button>
              </div>
            </form>
            <div class="admin-list-summary">
              <p role="status" aria-live="polite">
                {{
                  busy()
                    ? 'Atualizando cadastros…'
                    : total() + (total() === 1 ? ' cadastro' : ' cadastros')
                }}
              </p>
              <button
                type="button"
                class="admin-filter-link"
                [disabled]="busy()"
                (click)="openFilters()"
              >
                <i class="fa-solid fa-filter" aria-hidden="true"></i>{{ filterSummary() }}
              </button>
            </div>
            <ul
              class="sf-people-list"
              aria-label="Cadastros de anfitriões e músicos"
              [attr.aria-busy]="busy()"
            >
              @for (a of accounts(); track a.email) {
                <li>
                  <button
                    type="button"
                    class="sf-person-row admin-account-row"
                    [disabled]="busy()"
                    (click)="open(a)"
                  >
                    <i
                      [class.fa-bullhorn]="a.role === 'HOST'"
                      [class.fa-guitar]="a.role === 'MUSICIAN'"
                      class="fa-solid admin-avatar"
                      aria-hidden="true"
                    ></i>
                    <span class="admin-person-copy">
                      <strong>{{ a.name || a.email }}</strong>
                      @if (a.name) {
                        <span class="admin-email">{{ a.email }}</span>
                      }
                      <span class="admin-account-meta">
                        <span>{{ a.role === 'HOST' ? 'Anfitrião' : 'Músico' }}</span>
                        <app-status-badge
                          [tone]="
                            a.status === 'APPROVED'
                              ? 'positive'
                              : a.status === 'PENDING'
                                ? 'attention'
                                : 'neutral'
                          "
                          >{{ listStatus(a) }}</app-status-badge
                        >
                      </span>
                    </span>
                    <i class="fa-solid fa-chevron-right admin-row-arrow" aria-hidden="true"></i>
                  </button>
                </li>
              } @empty {
                <li class="admin-empty-state">
                  <span class="sf-card-icon" aria-hidden="true"
                    ><i class="fa-solid fa-users"></i
                  ></span>
                  <h2>
                    Nenhum cadastro
                    {{ filters.controls.status.value === 'PENDING' ? 'pendente' : 'encontrado' }}
                  </h2>
                  <p>
                    {{
                      filters.controls.search.value
                        ? 'Tente outro nome ou e-mail, ou ajuste os filtros.'
                        : filters.controls.status.value === 'PENDING'
                          ? 'Quando alguém se cadastrar, a solicitação aparecerá aqui.'
                          : 'Ajuste os filtros para consultar outros cadastros.'
                    }}
                  </p>
                </li>
              }
            </ul>
            @if (total() > 25 || page() > 0) {
              <nav class="admin-pagination" aria-label="Páginas de cadastros">
                <button
                  type="button"
                  class="sf-icon-button"
                  aria-label="Página anterior"
                  [disabled]="busy() || page() === 0"
                  (click)="load(page() - 1)"
                >
                  <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
                </button>
                <span>Página {{ page() + 1 }}</span>
                <button
                  type="button"
                  class="sf-icon-button"
                  aria-label="Próxima página"
                  [disabled]="busy() || (page() + 1) * 25 >= total()"
                  (click)="load(page() + 1)"
                >
                  <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                </button>
              </nav>
            }
          </app-surface-card>
        }
      }
    </main>
    @if (showingFilters()) {
      <app-confirmation-dialog
        title="Filtrar cadastros"
        [busy]="busy()"
        returnFocus="admin-list-options"
        (dismissed)="showingFilters.set(false)"
      >
        <p>Escolha quais cadastros deseja consultar.</p>
        <form class="host-form" [formGroup]="filterDraft" (ngSubmit)="applyFilters()">
          <label for="admin-filter-status">Situação</label>
          <select
            id="admin-filter-status"
            class="admin-select"
            formControlName="status"
            [disabled]="busy()"
          >
            <option value="">Todas</option>
            <option value="PENDING">Pendentes</option>
            <option value="APPROVED">Aprovados</option>
            <option value="REJECTED">Rejeitados</option>
            <option value="SUSPENDED">Suspensos</option>
          </select>
          <label for="admin-filter-role">Perfil</label>
          <select
            id="admin-filter-role"
            class="admin-select"
            formControlName="role"
            [disabled]="busy()"
          >
            <option value="">Todos</option>
            <option value="HOST">Anfitrião</option>
            <option value="MUSICIAN">Músico</option>
          </select>
          <div class="sf-dialog-actions">
            <button type="submit" class="sf-button sf-primary" [disabled]="busy()">
              Aplicar filtros
            </button>
            <button
              type="button"
              class="sf-button sf-outline"
              [disabled]="busy()"
              (click)="showingFilters.set(false)"
            >
              Cancelar
            </button>
          </div>
        </form>
      </app-confirmation-dialog>
    }
    @if (selected(); as a) {
      <app-confirmation-dialog
        [title]="decision() ? decisionTitle() : 'Detalhes do cadastro'"
        [busy]="busy()"
        (dismissed)="dismiss()"
      >
        <div dialog-actions>
          @if (!decision()) {
            <app-options-menu
              buttonId="admin-account-actions"
              label="Ações do cadastro"
              [disabled]="busy() || !!a.administrator"
              [items]="actions(a)"
            />
          }
        </div>
        @if (!decision()) {
          <h2>{{ a.name || a.email }}</h2>
          <p>{{ a.email }}</p>
          <p>{{ a.role === 'HOST' ? 'Anfitrião' : 'Músico' }} · {{ label(a) }}</p>
          <p>
            E-mail {{ a.emailVerified ? 'confirmado' : 'não confirmado' }} · Criado em
            {{ a.createdAt | date: 'dd/MM/yyyy HH:mm' }}
          </p>
          @if (a.administrator) {
            <p>Conta administrativa protegida.</p>
          }
          <h3>Histórico do cadastro</h3>
          <div class="stage-history" role="region" aria-label="Histórico do cadastro" tabindex="0">
            @for (e of events(); track $index) {
              <article>
                <strong>{{ eventLabel(e.action) }}</strong>
                <p>{{ e.actor }} · {{ e.occurredAt | date: 'dd/MM/yyyy HH:mm' }}</p>
                @if (e.reason) {
                  <p>{{ e.reason }}</p>
                }
              </article>
            } @empty {
              <p>Nenhuma alteração registrada.</p>
            }
          </div>
          <div class="sf-dialog-actions">
            <button class="sf-button sf-outline" (click)="dismiss()">Fechar</button>
          </div>
        } @else {
          <p>{{ a.name || a.email }} · {{ a.email }}</p>
          <p>
            {{
              decision() === 'APPROVED'
                ? 'O acesso ao painel será liberado.'
                : 'O acesso ao painel será bloqueado, inclusive nas próximas chamadas de quem já está conectado.'
            }}
          </p>
          @if (dialogError()) {
            <p class="sf-dialog-error" role="alert">{{ dialogError() }}</p>
          }
          <label class="host-form"
            >Motivo {{ decision() === 'APPROVED' ? '(opcional)' : ''
            }}<textarea
              class="sf-button sf-outline"
              rows="3"
              aria-label="Motivo"
              maxlength="500"
              [value]="reason()"
              [disabled]="busy()"
              (input)="reason.set($any($event.target).value)"
            ></textarea>
          </label>
          <div class="sf-dialog-actions">
            <button
              class="sf-button"
              [class.sf-primary]="decision() === 'APPROVED'"
              [class.sf-danger]="decision() !== 'APPROVED'"
              [disabled]="busy() || (decision() !== 'APPROVED' && !reason().trim())"
              (click)="confirm()"
            >
              {{ decisionTitle() }}</button
            ><button class="sf-button sf-outline" [disabled]="busy()" (click)="decision.set('')">
              Voltar aos detalhes
            </button>
          </div>
        }
      </app-confirmation-dialog>
    }
  `,
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
  readonly section = signal<'accounts' | 'sessions' | 'catalog'>('accounts');
  selectSection(section: 'accounts' | 'sessions' | 'catalog') {
    if (this.busy()) return;
    this.section.set(section);
    this.revealPage(
      section === 'accounts'
        ? 'admin-accounts-title'
        : section === 'catalog'
          ? 'admin-catalog-title'
          : 'admin-sessions-title',
    );
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
    return statusLabel + (role ? ' · ' + (role === 'HOST' ? 'Anfitriões' : 'Músicos') : '');
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
