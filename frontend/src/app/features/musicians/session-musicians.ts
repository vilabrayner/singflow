import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { MenuItem } from 'primeng/api';
import { ApiClient, apiError } from '../../core/http/api-client';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import { OptionsMenu } from '../../shared/components/options-menu';
import { Notifications } from '../../shared/notifications';
import { createOperationId } from '../../shared/operation-id';

interface Member {
  email: string;
}
@Component({
  selector: 'app-session-musicians',
  imports: [ConfirmationDialog, OptionsMenu, ReactiveFormsModule, InputTextModule],
  template: `
    <app-confirmation-dialog
      title="Músicos da sessão"
      returnFocus="session-options-button"
      [busy]="busy()"
      [error]="revoking() ? '' : error()"
      (dismissed)="close()"
    >
      <p>O músico cria a conta em “Músico”. Libere esta sessão usando o mesmo e-mail.</p>
      <h3>Acessos liberados</h3>
      <ul class="sf-people-list sf-dialog-list">
        @for (member of members(); track member.email; let index = $index) {
          <li class="sf-musician-member">
            <span>{{ member.email }}</span>
            <app-options-menu
              [buttonId]="'musician-access-' + index"
              [label]="'Opções de ' + member.email"
              [items]="options(member)"
              [disabled]="busy()"
            />
          </li>
        } @empty {
          <li>{{ busy() ? 'Carregando acessos…' : 'Nenhum músico com acesso a esta sessão.' }}</li>
        }
      </ul>
      <form class="host-form" [formGroup]="form" (ngSubmit)="grant()">
        <label
          >E-mail do músico<input
            id="musician-access-email"
            pInputText
            type="email"
            formControlName="email"
            autocomplete="email"
            maxlength="254"
            required
            [readOnly]="busy()"
        /></label>
        <div class="sf-dialog-actions">
          <button
            type="submit"
            class="sf-button sf-primary sf-full"
            [disabled]="busy() || form.invalid"
          >
            Liberar acesso
          </button>
          <button
            type="button"
            class="sf-button sf-outline sf-full"
            [disabled]="busy()"
            (click)="close()"
          >
            Fechar
          </button>
        </div>
      </form>
      @if (revoking(); as email) {
        <app-confirmation-dialog
          title="Revogar acesso do músico?"
          returnFocus="musician-access-email"
          [busy]="busy()"
          [error]="error()"
          (dismissed)="revoking.set(null)"
        >
          <p>
            {{ email }} deixará de consultar esta sessão. A conta continuará disponível para outros
            eventos.
          </p>
          <div class="sf-dialog-actions">
            <button
              type="button"
              class="sf-button sf-danger"
              [disabled]="busy()"
              (click)="revoke(email)"
            >
              Confirmar revogação
            </button>
            <button
              type="button"
              class="sf-button sf-outline"
              [disabled]="busy()"
              (click)="revoking.set(null)"
            >
              Manter acesso
            </button>
          </div>
        </app-confirmation-dialog>
      }
    </app-confirmation-dialog>
  `,
})
export class SessionMusicians implements OnInit {
  readonly session = input.required<string>();
  readonly dismissed = output<void>();
  private readonly api = inject(ApiClient);
  private readonly notifications = inject(Notifications);
  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
  });
  readonly busy = signal(false);
  readonly error = signal('');
  readonly members = signal<Member[]>([]);
  readonly revoking = signal<string | null>(null);
  private operation: { email: string; id: string } | null = null;
  private get path() {
    return `/sessions/${this.session()}/musicians`;
  }
  async ngOnInit() {
    this.busy.set(true);
    try {
      this.members.set(await this.api.get<Member[]>(this.path));
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
  options(member: Member): MenuItem[] {
    return [
      {
        label: 'Revogar acesso',
        icon: 'pi pi-user-minus',
        command: () => {
          this.error.set('');
          this.revoking.set(member.email);
        },
      },
    ];
  }
  close() {
    if (!this.busy()) this.dismissed.emit();
  }
  async grant() {
    if (this.busy() || this.form.invalid) return;
    const email = this.form.controls.email.value.trim().toLowerCase();
    if (this.operation?.email !== email) this.operation = { email, id: createOperationId() };
    this.busy.set(true);
    this.error.set('');
    try {
      this.members.set(
        await this.api.post<Member[]>(this.path, { email, operationId: this.operation.id }),
      );
      this.operation = null;
      this.form.reset();
      this.notifications.success('Acesso do músico liberado para esta sessão.');
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? (error.error?.detail ?? apiError(error))
          : apiError(error),
      );
    } finally {
      this.busy.set(false);
    }
  }
  async revoke(email: string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      this.members.set(await this.api.post<Member[]>(`${this.path}/revoke`, { email }));
      this.revoking.set(null);
      this.notifications.success('Acesso do músico revogado nesta sessão.');
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
