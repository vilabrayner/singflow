import { MenuItem } from 'primeng/api';
import { OptionsMenu } from '../../shared/components/options-menu';
import { DatePipe } from '@angular/common';
import { Component, inject, input, OnDestroy, signal } from '@angular/core';
import { Notifications } from '../../shared/notifications';
import { ApiClient, apiError } from '../../core/http/api-client';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';

interface MobileAccess {
  linked: boolean;
  pending: boolean;
}

@Component({
  selector: 'app-participant-mobile-access',
  imports: [ConfirmationDialog, DatePipe, OptionsMenu],
  template: `
    @if (!triggerHidden()) {
      <button
        type="button"
        class="sf-icon-button"
        [attr.aria-label]="'Acesso pelo celular de ' + name()"
        [title]="access()?.linked ? 'Celular vinculado' : 'Conceder acesso pelo celular'"
        aria-haspopup="dialog"
        [disabled]="disabled()"
        (click)="open()"
      >
        <i class="pi pi-qrcode" aria-hidden="true"></i>
      </button>
    }
    @if (showing()) {
      <app-confirmation-dialog
        [title]="(access()?.linked ? 'Acesso pelo celular de ' : 'Conceder acesso a ') + name()"
        [busy]="busy()"
        [error]="error()"
        [returnFocus]="returnFocus()"
        (dismissed)="close()"
      >
        <div dialog-actions>
          @if (access()?.linked) {
            <app-options-menu
              [buttonId]="'mobile-access-options-' + participant()"
              label="Opções do acesso pelo celular"
              [items]="accessMenu"
              [disabled]="busy()"
            />
          }
        </div>
        @if (access()?.linked) {
          <p role="status"><strong>Celular vinculado</strong></p>
        }
        @if (qr(); as image) {
          <p>Peça ao participante para escanear e confirmar. O código só pode ser usado uma vez.</p>
          <img
            class="entry-qr"
            [src]="image"
            alt="QR Code de acesso individual"
            width="256"
            height="256"
          />
          <label class="host-form">
            Link de acesso individual
            <input
              class="entry-link"
              readonly
              [value]="url()"
              (focus)="$any($event.target).select()"
            />
          </label>
          <p>Válido até {{ expiresAt() | date: 'HH:mm' }}.</p>
        } @else if (busy()) {
          <p role="status">Preparando acesso…</p>
        } @else if (access()?.linked) {
          <p>O celular anterior mantém o acesso até o novo aparelho confirmar o vínculo.</p>
        }
        <div class="sf-dialog-actions">
          @if (qr()) {
            <button
              type="button"
              class="sf-button sf-primary sf-full"
              [disabled]="busy()"
              (click)="copy()"
            >
              <i class="pi pi-copy" aria-hidden="true"></i>Copiar link
            </button>
          } @else if (!access()?.linked && !busy()) {
            <button type="button" class="sf-button sf-primary sf-full" (click)="open()">
              Gerar QR Code
            </button>
          }
          <button
            type="button"
            class="sf-button sf-outline sf-full"
            [disabled]="busy()"
            (click)="close()"
          >
            Fechar
          </button>
        </div>
      </app-confirmation-dialog>
    }
  `,
})
export class ParticipantMobileAccess implements OnDestroy {
  private readonly api = inject(ApiClient);
  private readonly notifications = inject(Notifications);
  readonly session = input.required<string>();
  readonly participant = input.required<string>();
  readonly name = input.required<string>();
  readonly disabled = input(false);
  readonly triggerHidden = input(false);
  readonly returnFocus = input<string>();
  readonly showing = signal(false);
  readonly busy = signal(false);
  readonly access = signal<MobileAccess | null>(null);
  readonly error = signal('');
  readonly qr = signal('');
  readonly url = signal('');
  readonly expiresAt = signal('');
  readonly accessMenu: MenuItem[] = [
    { label: 'Trocar celular', icon: 'pi pi-refresh', command: () => this.issue() },
  ];
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;

  private get path() {
    return `/sessions/${this.session()}/participants/${this.participant()}/mobile-access`;
  }

  async open() {
    if (this.busy()) return;
    this.showing.set(true);
    this.busy.set(true);
    this.error.set('');
    try {
      const access = await this.api.get<MobileAccess>(this.path);
      this.access.set(access);
      if (!access.linked) await this.generate();
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }

  async issue() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.generate();
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async generate() {
    clearTimeout(this.timer);
    const generation = ++this.generation;
    const invitation = await this.api.post<{ url: string; expiresAt: string }>(this.path);
    const { default: qr } = await import('qrcode');
    const image = await qr.toDataURL(invitation.url, {
      width: 256,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B1E3F', light: '#ffffff' },
    });
    if (!this.showing() || generation !== this.generation) return;
    this.expiresAt.set(invitation.expiresAt);
    this.url.set(invitation.url);
    this.qr.set(image);
    this.scheduleCheck();
  }

  private scheduleCheck() {
    const generation = this.generation;
    this.timer = setTimeout(async () => {
      if (!this.showing() || generation !== this.generation) return;
      if (Date.parse(this.expiresAt()) <= Date.now()) {
        this.qr.set('');
        this.error.set('Este QR Code expirou. Gere outro se precisar.');
        return;
      }
      try {
        const access = await this.api.get<MobileAccess>(this.path);
        if (!this.showing() || generation !== this.generation) return;
        this.access.set(access);
        if (!access.pending) {
          this.qr.set('');
          return;
        }
      } catch {
        // Keep the code available until its expiry if the status check fails.
      }
      if (this.showing() && generation === this.generation) this.scheduleCheck();
    }, 2500);
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

  close() {
    this.generation++;
    this.showing.set(false);
    this.qr.set('');
    this.url.set('');
    clearTimeout(this.timer);
  }

  ngOnDestroy() {
    this.close();
  }
}
