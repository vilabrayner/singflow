import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PanelHeader } from '../../shared/components/panel-header';
import { SurfaceCard } from '../../shared/components/surface-card';
import { ApiClient, apiError } from '../../core/http/api-client';
import { HostAuth } from './host-auth';
import { AccountView, accountActive, accountStatus } from './account-view';
@Component({
  selector: 'app-account-status-page',
  imports: [PanelHeader, SurfaceCard, RouterLink],
  template: ` <app-panel-header />
    <main class="sf-host-shell">
      <div class="sf-centered-state">
        <app-surface-card labelledBy="account-status-title">
          <h1 id="account-status-title">
            {{ account() ? label(account()!) : 'Situação da conta' }}
          </h1>
          @if (message()) {
            <p role="status">{{ message() }}</p>
          }
          @if (error()) {
            <p role="alert" class="sf-dialog-error">{{ error() }}</p>
          }
          @if (account(); as a) {
            <p>{{ a.email }}</p>
            @if (a.status === 'PENDING') {
              @if (!a.emailVerified) {
                <p>
                  Abra o e-mail de confirmação. Depois de confirmar, seu cadastro será analisado
                  pelo administrador.
                </p>
              } @else {
                <p>
                  Seu e-mail está confirmado. Aguarde a aprovação do administrador para acessar o
                  painel.
                </p>
              }
            } @else if (a.status === 'SUSPENDED' || a.status === 'REJECTED') {
              <p>Entre em contato com o responsável pelo SingFlow para revisar seu cadastro.</p>
            }
            <div class="sf-dialog-actions">
              <button class="sf-button sf-primary" [disabled]="busy()" (click)="refresh()">
                Atualizar situação
              </button>
              @if (!a.emailVerified && a.status === 'PENDING') {
                <button class="sf-button sf-outline" [disabled]="busy()" (click)="resend()">
                  Reenviar confirmação
                </button>
              }
              <button class="sf-button sf-outline" [disabled]="busy()" (click)="logout()">
                Sair da conta
              </button>
            </div>
          } @else {
            <div class="sf-dialog-actions">
              <a class="sf-button sf-outline" routerLink="/anfitriao">Entrar como anfitrião</a
              ><a class="sf-button sf-outline" routerLink="/musico">Entrar como músico</a>
            </div>
          }
        </app-surface-card>
      </div>
    </main>`,
})
export class AccountStatusPage implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(HostAuth);
  private readonly router = inject(Router);
  readonly account = signal<AccountView | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly label = accountStatus;
  ngOnInit() {
    void this.refresh();
  }
  async refresh() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const a = await this.api.get<AccountView>('/auth/me');
      this.account.set(a);
      if (accountActive(a))
        await this.router.navigateByUrl(a.role === 'HOST' ? '/anfitriao' : '/musico');
    } catch (error) {
      this.account.set(null);
      if (!(error instanceof HttpErrorResponse && error.status === 401))
        this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
  async resend() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.post('/public/accounts/resend', { email: this.account()!.email });
      this.message.set(
        'Se houver confirmação pendente, enviaremos o link. Aguarde um minuto entre os envios.',
      );
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
  async logout() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.auth.logout();
      this.account.set(null);
      this.message.set('Você saiu da conta.');
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
