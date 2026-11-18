import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { HttpErrorResponse } from '@angular/common/http';
import { PanelHeader } from '../../shared/components/panel-header';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import { SurfaceCard } from '../../shared/components/surface-card';
import { ApiClient, apiError } from '../../core/http/api-client';
import { HostAuth } from '../identity/host-auth';
import { ParticipationMemory } from './participation-memory';
import { ParticipantNotifications } from './participant-notifications';
interface Profile {
  id: string;
  name: string;
  email: string;
  whatsappPhone: string | null;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
  version: number;
}
interface Session {
  id: string;
  name: string;
  status: string;
  participantName: string;
}
interface Capabilities {
  whatsappAvailable: boolean;
  pushAvailable: boolean;
  vapidPublicKey: string;
}
@Component({
  imports: [
    PanelHeader,
    SurfaceCard,
    RouterLink,
    ReactiveFormsModule,
    ConfirmationDialog,
    InputTextModule,
  ],
  styles: `
    :host {
      display: block;
    }
    .profile-main {
      max-width: 680px;
      margin: auto;
      display: grid;
      gap: 20px;
      padding: 20px 16px 36px;
    }
    .host-form label {
      display: grid;
      gap: 8px;
      font-weight: 700;
    }
    .host-form input {
      width: 100%;
      min-width: 0;
    }
    .profile-choice {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      margin: 14px 0;
    }
    .profile-choice input {
      width: 22px;
      height: 22px;
      flex: none;
      accent-color: var(--sf-purple, #7c3aed);
    }
    .profile-sessions {
      list-style: none;
      padding: 0;
      display: grid;
      gap: 12px;
    }
    .profile-sessions li {
      padding: 12px;
      border: 1px solid var(--sf-border);
      border-radius: 12px;
    }
    .profile-sessions strong {
      display: block;
      margin-bottom: 8px;
    }
    .profile-note {
      font-size: 14px;
      color: var(--sf-muted);
    }
    .profile-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
  `,
  template: `<app-panel-header>
      @if (profile()) {
        <button
          type="button"
          class="sf-icon-button"
          aria-label="Sair da conta"
          [disabled]="busy()"
          (click)="logout()"
        >
          <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
        </button>
      }
    </app-panel-header>
    <main class="profile-main">
      @if (error()) {
        <p class="sf-dialog-error" role="alert">{{ error() }}</p>
      }
      @if (message()) {
        <p role="status">{{ message() }}</p>
      }
      @if (ready() && !profile()) {
        <app-surface-card labelledBy="participant-login-title"
          ><h1 id="participant-login-title">Minha conta</h1>
          <p>Entre para guardar suas participações e escolher seus avisos.</p>
          <form class="host-form" [formGroup]="loginForm" (ngSubmit)="login()">
            <label
              >E-mail<input
                type="email"
                pInputText
                autocomplete="username"
                formControlName="email"
                [readOnly]="busy()" /></label
            ><label
              >Senha<input
                type="password"
                pInputText
                autocomplete="current-password"
                formControlName="password"
                [readOnly]="busy()" /></label
            ><button
              type="submit"
              class="sf-button sf-primary sf-full"
              [disabled]="busy() || loginForm.invalid"
            >
              Entrar
            </button>
          </form>
          <div class="sf-dialog-actions">
            <a class="sf-button sf-outline sf-full" routerLink="/cadastro/participante"
              >Criar conta de participante</a
            ><a
              class="sf-button sf-text sf-full"
              [routerLink]="currentSession ? '/participante/' + currentSession + '/vinculado' : '/'"
              >Continuar sem conta</a
            >
          </div></app-surface-card
        >
      }
      @if (profile(); as person) {
        <app-surface-card labelledBy="profile-title"
          ><h1 id="profile-title">Olá, {{ person.name }}!</h1>
          <p>{{ person.email }}</p>
          @if (currentSession) {
            <div class="sf-dialog-actions">
              <button
                type="button"
                class="sf-button sf-primary sf-full"
                [disabled]="busy()"
                (click)="linkCurrent()"
              >
                Vincular participação deste aparelho</button
              ><a
                class="sf-button sf-outline sf-full"
                [routerLink]="'/participante/' + currentSession + '/vinculado'"
                >Voltar à participação</a
              >
            </div>
          }
          <p class="profile-note">
            Vincular a conta preserva sua chegada, seus pedidos e suas apresentações.
          </p></app-surface-card
        >
        <app-surface-card labelledBy="notification-title"
          ><h2 id="notification-title">Avisos da minha vez</h2>
          <p>Escolha como receber sua convocação. Você pode desativar quando quiser.</p>
          <form [formGroup]="preferencesForm" (ngSubmit)="savePreferences()">
            <label class="profile-choice"
              ><input type="checkbox" formControlName="whatsapp" /><span
                >Receber pelo WhatsApp
                @if (person.whatsappPhone) {
                  <small class="profile-note">{{ person.whatsappPhone }}</small>
                }
              </span></label
            >
            <button
              type="button"
              class="sf-button sf-outline sf-full"
              [disabled]="busy() || !capabilities()?.whatsappAvailable"
              (click)="connectWhatsApp()"
            >
              <i class="fa-brands fa-whatsapp" aria-hidden="true"></i
              >{{ person.whatsappPhone ? 'Trocar número do WhatsApp' : 'Conectar meu WhatsApp' }}
            </button>
            @if (!capabilities()?.whatsappAvailable) {
              <p class="profile-note">WhatsApp ainda não disponível neste ambiente.</p>
            }
            @if (whatsappLink()) {
              <div class="sf-dialog-actions">
                <a
                  class="sf-button sf-primary sf-full"
                  [href]="whatsappLink()"
                  target="_blank"
                  rel="noopener noreferrer"
                  >Confirmar pelo WhatsApp
                  <i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i></a
                ><button
                  type="button"
                  class="sf-button sf-outline sf-full"
                  [disabled]="busy()"
                  (click)="refresh()"
                >
                  Já confirmei, atualizar
                </button>
              </div>
            }
            <label class="profile-choice"
              ><input type="checkbox" formControlName="push" /><span
                >Receber notificações nos aparelhos autorizados</span
              ></label
            >
            <div class="profile-actions">
              <button
                type="button"
                class="sf-button sf-outline"
                [disabled]="busy() || !capabilities()?.pushAvailable"
                (click)="enablePush()"
              >
                Ativar neste aparelho</button
              ><button
                type="button"
                class="sf-button sf-text"
                [disabled]="busy()"
                (click)="disablePush()"
              >
                Desativar neste aparelho
              </button>
            </div>
            @if (!capabilities()?.pushAvailable) {
              <p class="profile-note">Notificações ainda não disponíveis neste ambiente.</p>
            }
            <div class="sf-dialog-actions">
              <button type="submit" class="sf-button sf-primary sf-full" [disabled]="busy()">
                Salvar preferências
              </button>
            </div>
          </form></app-surface-card
        >
        <app-surface-card labelledBy="linked-sessions-title"
          ><h2 id="linked-sessions-title">Minhas participações</h2>
          <ul class="profile-sessions">
            @for (session of sessions(); track session.id) {
              <li>
                <strong>{{ session.name }}</strong>
                <p>
                  {{ session.participantName }} ·
                  {{ session.status === 'OPEN' ? 'Sessão aberta' : 'Sessão encerrada' }}
                </p>
                @if (session.status === 'OPEN') {
                  <button
                    type="button"
                    class="sf-button sf-outline sf-full"
                    [disabled]="busy()"
                    [id]="'restore-' + session.id"
                    (click)="restore(session.id)"
                  >
                    Retomar neste aparelho
                  </button>
                }
              </li>
            } @empty {
              <li>Vincule sua participação atual para encontrá-la aqui depois.</li>
            }
          </ul></app-surface-card
        >
      }
    </main>
    @if (restoring(); as target) {
      <app-confirmation-dialog
        [title]="'Retomar ' + target.name + '?'"
        [returnFocus]="'restore-' + target.session"
        [busy]="busy()"
        [error]="error()"
        (dismissed)="restoring.set(null)"
      >
        <p>
          Você retomará esta participação neste aparelho, preservando pedidos e apresentações. O
          acesso anterior será substituído.
        </p>
        @if (target.currentName) {
          <p>
            Este aparelho está acessando {{ target.currentName }}. Confirme para trocar o vínculo.
          </p>
        }
        <div class="sf-dialog-actions" dialog-footer>
          <button
            class="sf-button sf-primary"
            type="button"
            [disabled]="busy()"
            (click)="confirmRestore()"
          >
            Confirmar
          </button>
          <button
            class="sf-button sf-outline"
            type="button"
            [disabled]="busy()"
            (click)="restoring.set(null)"
          >
            Voltar
          </button>
        </div>
      </app-confirmation-dialog>
    }`,
})
export class ParticipantAccountPage implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(HostAuth);
  private readonly router = inject(Router);
  private readonly memory = inject(ParticipationMemory);
  private readonly notifications = inject(ParticipantNotifications);
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly currentSession = this.memory.current();
  readonly requestedSession = inject(ActivatedRoute).snapshot.queryParamMap.get('retomar');
  readonly restoring = signal<{
    session: string;
    name: string;
    currentId: string | null;
    currentName: string | null;
  } | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly sessions = signal<Session[]>([]);
  readonly capabilities = signal<Capabilities | null>(null);
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly whatsappLink = signal('');
  readonly loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  readonly preferencesForm = this.fb.group({ whatsapp: [false], push: [false] });
  ngOnInit() {
    void this.refresh();
  }
  private async load() {
    await this.auth.account();
    const [profile, sessions, capabilities] = await Promise.all([
      this.api.get<Profile>('/participant-account/me'),
      this.api.get<Session[]>('/participant-account/sessions'),
      this.api.get<Capabilities>('/participant-account/notifications/config'),
    ]);
    this.profile.set(profile);
    this.sessions.set(
      [...sessions].sort(
        (a, b) => Number(b.id === this.requestedSession) - Number(a.id === this.requestedSession),
      ),
    );
    this.capabilities.set(capabilities);
    this.preferencesForm.setValue({ whatsapp: profile.whatsappEnabled, push: profile.pushEnabled });
    if (profile.whatsappPhone) this.whatsappLink.set('');
  }
  async refresh() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.load();
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 401) this.profile.set(null);
      else this.error.set(apiError(e));
    } finally {
      this.ready.set(true);
      this.busy.set(false);
    }
  }
  private async run(action: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await action();
    } catch (e) {
      this.error.set(
        e instanceof Error && !(e instanceof HttpErrorResponse) ? e.message : apiError(e),
      );
    } finally {
      this.busy.set(false);
    }
  }
  async login() {
    if (this.loginForm.invalid) return;
    await this.run(async () => {
      await this.auth.login(
        this.loginForm.controls.email.value,
        this.loginForm.controls.password.value,
      );
      await this.load();
    });
  }
  async logout() {
    await this.run(async () => {
      await this.auth.logout();
      this.profile.set(null);
      this.loginForm.reset();
      this.whatsappLink.set('');
    });
  }
  async linkCurrent() {
    if (!this.currentSession) return;
    await this.run(async () => {
      const view = await this.api.get<{ participant: { id: string } }>(
        `/participation/${this.currentSession}/me`,
      );
      await this.api.post(
        `/participation/${this.currentSession}/account-link`,
        {},
        { 'X-SingFlow-Participant': view.participant.id },
      );
      await this.load();
      this.message.set('Participação vinculada à sua conta.');
    });
  }
  async restore(session: string) {
    await this.run(async () => {
      const info = await this.api.get<{
        name: string;
        currentId: string | null;
        currentName: string | null;
      }>(`/participation/${session}/account-restore-info`);
      this.restoring.set({ session, ...info });
    });
  }
  async confirmRestore() {
    const target = this.restoring();
    if (!target) return;
    await this.run(async () => {
      await this.api.post(`/participation/${target.session}/account-restore`, {
        replaceParticipantId: target.currentId,
      });
      this.memory.remember(target.session);
      this.restoring.set(null);
      await this.router.navigateByUrl(`/participante/${target.session}/vinculado`);
    });
  }
  async savePreferences() {
    await this.run(async () => {
      await this.api.post('/participant-account/notifications/preferences', {
        ...this.preferencesForm.getRawValue(),
        version: this.profile()!.version,
      });
      await this.load();
      this.message.set('Preferências salvas.');
    });
  }
  async connectWhatsApp() {
    if (!this.preferencesForm.controls.whatsapp.value) {
      this.error.set('Marque que deseja receber os avisos pelo WhatsApp antes de conectar.');
      return;
    }
    await this.run(async () => {
      const link = await this.api.post<{ url: string }>(
        '/participant-account/notifications/whatsapp',
        { accepted: true },
      );
      this.whatsappLink.set(link.url);
      this.message.set('Abra o WhatsApp e envie a mensagem pronta para confirmar seu número.');
    });
  }
  async enablePush() {
    await this.run(async () => {
      await this.notifications.enable(this.capabilities()!.vapidPublicKey);
      await this.load();
      this.message.set('Avisos ativados neste aparelho.');
    });
  }
  async disablePush() {
    await this.run(async () => {
      await this.notifications.disable();
      await this.load();
      this.message.set('Avisos desativados neste aparelho.');
    });
  }
}
