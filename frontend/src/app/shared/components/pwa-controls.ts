import { Component, inject, input, signal } from '@angular/core';
import { Pwa } from '../../core/pwa/pwa';
import { ConfirmationDialog } from './confirmation-dialog';
@Component({
  selector: 'app-pwa-install',
  imports: [ConfirmationDialog],
  template: `
    @if (!pwa.installed()) {
      <button type="button" class="sf-button sf-outline sf-full" (click)="install()">
        <i class="fa-solid fa-download" aria-hidden="true"></i>Instalar SingFlow
      </button>
    }
    @if (instructions()) {
      <app-confirmation-dialog title="Instalar SingFlow" (dismissed)="instructions.set(false)">
        @if (!pwa.secure) {
          <p>
            Abra o endereço HTTPS do SingFlow. O acesso HTTP por IP da rede não permite instalar os
            recursos do aplicativo.
          </p>
        } @else if (pwa.ios) {
          <p>
            No menu de compartilhamento do navegador, escolha “Adicionar à Tela de Início”. Depois,
            abra o SingFlow pelo ícone para ativar as notificações.
          </p>
        } @else {
          <p>
            Abra o menu do navegador e procure “Instalar aplicativo” ou “Adicionar à tela inicial”.
            A disponibilidade depende do navegador.
          </p>
        }
        <div dialog-footer class="sf-dialog-actions">
          <button type="button" class="sf-button sf-primary" (click)="instructions.set(false)">
            Entendi
          </button>
        </div>
      </app-confirmation-dialog>
    }
  `,
})
export class PwaInstall {
  readonly pwa = inject(Pwa);
  readonly instructions = signal(false);
  async install() {
    try {
      if (!(await this.pwa.install())) this.instructions.set(true);
    } catch {
      this.instructions.set(true);
    }
  }
}
@Component({
  selector: 'app-pwa-status',
  imports: [ConfirmationDialog],
  styles: `
    .pwa-notice {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: calc(var(--sf-dock-height, 76px) + env(safe-area-inset-bottom) + 16px);
      z-index: 1100;
      max-width: 520px;
      margin: auto;
      padding: 12px 16px;
      border: 1px solid #cbb7f7;
      border-radius: 14px;
      background: #fff;
      box-shadow: 0 8px 30px #0b1e3f20;
      display: flex;
      gap: 12px;
      align-items: center;
      font-size: 14px;
    }
    .pwa-notice p {
      margin: 0;
    }
    .pwa-notice button {
      flex: none;
      min-height: 44px;
    }
    .pwa-offline {
      background: #fff7dd;
      border-color: #f1d68d;
    }
  `,
  template: `
    @if (!hidden()) {
      @if (!pwa.online()) {
        <div class="pwa-notice pwa-offline" role="status">
          <i class="fa-solid fa-wifi" aria-hidden="true"></i>
          <p>Sem conexão detectada. Aguarde a reconexão para confirmar suas ações.</p>
        </div>
      } @else if (pwa.updateAvailable() && !dismissed()) {
        <div class="pwa-notice" role="status">
          <p>Nova versão do SingFlow disponível.</p>
          <button class="sf-button sf-primary" type="button" (click)="confirming.set(true)">
            Atualizar</button
          ><button
            class="sf-icon-button"
            type="button"
            aria-label="Lembrar depois"
            (click)="dismissed.set(true)"
          >
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      }
      @if (confirming()) {
        <app-confirmation-dialog title="Atualizar SingFlow?" (dismissed)="confirming.set(false)"
          ><p>
            A página será recarregada. Conclua ou salve o que estiver preenchendo antes de
            atualizar.
          </p>
          <div class="sf-dialog-actions" dialog-footer>
            <button class="sf-button sf-primary" type="button" (click)="pwa.update()">
              Atualizar agora</button
            ><button class="sf-button sf-outline" type="button" (click)="confirming.set(false)">
              Voltar
            </button>
          </div></app-confirmation-dialog
        >
      }
    }
  `,
})
export class PwaStatus {
  readonly pwa = inject(Pwa);
  readonly hidden = input(false);
  readonly confirming = signal(false);
  readonly dismissed = signal(false);
}
