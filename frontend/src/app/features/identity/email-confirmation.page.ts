import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { PanelHeader } from '../../shared/components/panel-header';
import { SurfaceCard } from '../../shared/components/surface-card';
import { ApiClient, apiError } from '../../core/http/api-client';
@Component({
  selector: 'app-email-confirmation-page',
  imports: [PanelHeader, SurfaceCard, RouterLink],
  template: ` <app-panel-header />
    <main class="sf-host-shell">
      <div class="sf-centered-state">
        <app-surface-card labelledBy="verification-title">
          <h1 id="verification-title">
            {{ done() ? 'E-mail confirmado' : 'Confirmar seu e-mail' }}
          </h1>
          @if (error()) {
            <p role="alert" class="sf-dialog-error">{{ error() }}</p>
          }
          @if (done()) {
            <p role="status">
              Se você criou uma conta de participante, o acesso já está liberado. Anfitriões e
              músicos aguardam aprovação do administrador.
            </p>
          } @else if (token) {
            <p>Confirme o e-mail para continuar seu cadastro.</p>
          } @else {
            <p>
              Abra o link que enviamos para seu e-mail. Para solicitar outro, entre na sua conta.
            </p>
          }
          <div class="sf-dialog-actions">
            @if (token && !done()) {
              <button class="sf-button sf-primary" [disabled]="busy()" (click)="confirm()">
                Confirmar e-mail
              </button>
            }
            <a class="sf-button sf-primary" routerLink="/minha-conta">Entrar como participante</a>
            <a class="sf-button sf-outline" routerLink="/anfitriao">Entrar como anfitrião</a>
            <a class="sf-button sf-outline" routerLink="/musico">Entrar como músico</a>
          </div></app-surface-card
        >
      </div>
    </main>`,
})
export class EmailConfirmationPage {
  private readonly api = inject(ApiClient);
  private readonly document = inject(DOCUMENT);
  readonly token = new URLSearchParams(this.document.location.hash.slice(1)).get('token') ?? '';
  readonly busy = signal(false);
  readonly error = signal('');
  readonly done = signal(false);
  constructor() {
    // Keep confirmation tokens out of history, referrers and server access logs.
    this.document.defaultView?.history.replaceState(null, '', this.document.location.pathname);
  }
  async confirm() {
    if (this.busy() || this.done()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.post('/public/accounts/verify', { token: this.token });
      this.done.set(true);
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 400
          ? (error.error?.detail ?? 'Link inválido ou expirado.')
          : apiError(error),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
