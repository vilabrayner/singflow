import { Component, inject, input, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ApiClient, apiError } from '../../core/http/api-client';

@Component({
  selector: 'app-entry-share',
  imports: [ButtonModule],
  template: `
    <section class="host-panel">
      <h2>Entrada pelo celular</h2>
      <p>
        Compartilhe o link ou mostre o QR Code. Quem precisar de ajuda continua podendo se inscrever
        com você.
      </p>
      @if (error()) {
        <p role="alert" class="host-error">{{ error() }}</p>
      }
      @if (notice()) {
        <p role="status">{{ notice() }}</p>
      }
      @if (!url()) {
        <p-button
          label="Mostrar link e QR Code"
          icon="pi pi-qrcode"
          [disabled]="busy()"
          (onClick)="load()"
        />
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
            (onClick)="confirming.set(true)"
          />
        </div>
        <p>
          Em localhost ou 127.0.0.1, o link funciona apenas neste computador. O teste em aparelho
          físico depende de configurar a rede ou a hospedagem.
        </p>
        @if (confirming()) {
          <div class="stage-wait">
            <p>
              O QR Code e o link anteriores deixarão de aceitar novas entradas. Quem já está
              inscrito continuará conectado.
            </p>
            <p-button
              label="Confirmar troca do link"
              [disabled]="busy()"
              (onClick)="load(true)"
            /><p-button label="Manter link" [text]="true" (onClick)="confirming.set(false)" />
          </div>
        }
      }
    </section>
  `,
})
export class EntryShare {
  readonly session = input.required<string>();
  private readonly api = inject(ApiClient);
  readonly busy = signal(false);
  readonly url = signal('');
  readonly qr = signal('');
  readonly error = signal('');
  readonly notice = signal('');
  readonly confirming = signal(false);
  private rotation = crypto.randomUUID();
  async load(rotate = false) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const path = `/sessions/${this.session()}/entry-link`;
      const result = rotate
        ? await this.api.post<{ url: string }>(`${path}/rotate`, { operationId: this.rotation })
        : await this.api.get<{ url: string }>(path);
      this.url.set(result.url);
      const qr = await import('qrcode');
      this.qr.set(
        await qr.toDataURL(result.url, {
          width: 256,
          margin: 4,
          errorCorrectionLevel: 'M',
          color: { dark: '#0B1E3F', light: '#ffffff' },
        }),
      );
      this.confirming.set(false);
      if (rotate) {
        this.rotation = crypto.randomUUID();
        this.notice.set('Link e QR Code atualizados.');
      }
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
  async copy() {
    try {
      await navigator.clipboard.writeText(this.url());
      this.notice.set('Link copiado.');
    } catch {
      this.notice.set('Selecione o link acima e copie manualmente.');
    }
  }
}
