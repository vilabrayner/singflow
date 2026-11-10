import { Notifications } from '../../shared/notifications';
import { NgTemplateOutlet } from '@angular/common';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import {
  afterNextRender,
  Component,
  inject,
  Injector,
  input,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ApiClient, apiError } from '../../core/http/api-client';

@Component({
  selector: 'app-entry-share',
  imports: [ConfirmationDialog, ButtonModule, NgTemplateOutlet],
  template: `
    @if (inline()) {
      <section class="host-panel" aria-label="Entrada pelo celular">
        <h2>Entrada pelo celular</h2>
        <ng-container [ngTemplateOutlet]="shareContent" />
      </section>
    } @else {
      <button
        type="button"
        class="sf-icon-button"
        aria-label="Compartilhar link e QR Code"
        title="Compartilhar link e QR Code"
        aria-haspopup="dialog"
        (click)="open()"
      >
        <i class="pi pi-qrcode" aria-hidden="true"></i>
      </button>
    }

    @if (showing() || confirming()) {
      <app-confirmation-dialog
        [title]="confirming() ? 'Trocar link e QR Code?' : 'Compartilhar link e QR Code'"
        [busy]="confirming() && busy()"
        (dismissed)="dismiss()"
      >
        @if (confirming()) {
          @if (error()) {
            <p role="alert" class="sf-dialog-error">{{ error() }}</p>
          }
          <p>
            O QR Code e o link anteriores deixarão de aceitar novas entradas. Quem já está inscrito
            continuará conectado.
          </p>
          <div class="host-actions">
            <button
              type="button"
              class="sf-button sf-primary"
              [disabled]="busy()"
              (click)="load(true)"
            >
              Confirmar troca do link
            </button>
            <button
              type="button"
              class="sf-button sf-outline"
              [disabled]="busy()"
              (click)="dismiss()"
            >
              Manter link
            </button>
          </div>
        } @else {
          <ng-container [ngTemplateOutlet]="shareContent" />
          <button type="button" class="sf-button sf-outline sf-full" (click)="dismiss()">
            Fechar
          </button>
        }
      </app-confirmation-dialog>
    }

    <ng-template #shareContent>
      <p>Escaneie o QR Code para entrar na sessão pelo celular.</p>
      @if (error() && !confirming()) {
        <p role="alert" class="sf-dialog-error">{{ error() }}</p>
      }
      @if (busy() && !url()) {
        <p role="status">Carregando QR Code…</p>
      }
      @if (error() && !confirming()) {
        <button type="button" class="sf-button sf-outline" [disabled]="busy()" (click)="load()">
          Tentar gerar QR Code novamente
        </button>
      }
      @if (url(); as link) {
        @if (qr()) {
          <img
            class="entry-qr"
            [src]="qr()"
            alt="QR Code para entrar nesta sessão"
            width="256"
            height="256"
          />
        }
        <label class="host-form"
          >Link da sessão<input
            class="entry-link"
            readonly
            [value]="link"
            (focus)="$any($event.target).select()"
        /></label>
        <p class="entry-link">
          <a [href]="link" target="_blank" rel="noopener noreferrer"
            >Abrir entrada do participante</a
          >
        </p>
        <div class="stage-actions">
          <p-button
            label="Copiar link"
            icon="pi pi-copy"
            [disabled]="busy()"
            (onClick)="copy()"
          /><p-button
            label="Trocar link"
            [outlined]="true"
            [disabled]="busy()"
            (onClick)="askRotation()"
          />
        </div>
        <p>
          Em localhost ou 127.0.0.1, o link funciona apenas neste computador. O teste em aparelho
          físico depende de configurar a rede ou a hospedagem.
        </p>
      }
    </ng-template>
  `,
})
export class EntryShare implements OnInit {
  readonly session = input.required<string>();
  readonly inline = input(false);
  readonly showing = signal(false);
  private readonly api = inject(ApiClient);
  private readonly injector = inject(Injector);
  private readonly dialog = viewChild(ConfirmationDialog);
  readonly busy = signal(false);
  readonly url = signal('');
  readonly qr = signal('');
  readonly error = signal('');
  private readonly notifications = inject(Notifications);
  readonly confirming = signal(false);
  private rotation = crypto.randomUUID();
  ngOnInit() {
    if (this.inline()) void this.load();
  }
  open() {
    this.showing.set(true);
    if (!this.qr()) void this.load();
  }
  private focusDialog() {
    if (this.showing()) {
      afterNextRender(() => this.dialog()?.focusTitle(), { injector: this.injector });
    }
  }
  askRotation() {
    this.error.set('');
    this.confirming.set(true);
    this.focusDialog();
  }
  dismiss() {
    if (this.confirming()) {
      this.confirming.set(false);
      this.focusDialog();
    } else {
      this.showing.set(false);
    }
  }
  async load(rotate = false) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const path = `/sessions/${this.session()}/entry-link`;
      const result = rotate
        ? await this.api.post<{ url: string }>(`${path}/rotate`, { operationId: this.rotation })
        : await this.api.get<{ url: string }>(path);
      const qr = await import('qrcode');
      const image = await qr.toDataURL(result.url, {
        width: 256,
        margin: 4,
        errorCorrectionLevel: 'M',
        color: { dark: '#0B1E3F', light: '#ffffff' },
      });
      this.url.set(result.url);
      this.qr.set(image);
      this.confirming.set(false);
      if (rotate) {
        this.focusDialog();
        this.rotation = crypto.randomUUID();
        this.notifications.success('Link e QR Code atualizados.');
      }
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
  async copy() {
    this.error.set('');
    try {
      await navigator.clipboard.writeText(this.url());
      this.notifications.success('Link copiado.');
    } catch {
      this.error.set('Selecione o link acima e copie manualmente.');
    }
  }
}
