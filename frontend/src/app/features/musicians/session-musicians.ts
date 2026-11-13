import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { MenuItem } from 'primeng/api';
import { ApiClient, apiError } from '../../core/http/api-client';
import { SurfaceCard } from '../../shared/components/surface-card';
import { NgTemplateOutlet } from '@angular/common';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import { OptionsMenu } from '../../shared/components/options-menu';
import { Notifications } from '../../shared/notifications';
import { createOperationId } from '../../shared/operation-id';

interface Musician {
  id: string;
  name: string;
}
interface Member extends Musician {
  enabled: boolean;
}
@Component({
  selector: 'app-session-musicians',
  imports: [
    SurfaceCard,
    NgTemplateOutlet,
    ConfirmationDialog,
    OptionsMenu,
    ReactiveFormsModule,
    SelectModule,
  ],
  styleUrls: ['../../shared/styles/song-panels.css', '../../shared/styles/host-panels.css'],
  styles: `
    p-select {
      width: 100%;
      min-height: var(--sf-touch);
    }
    .member-copy {
      flex: 1;
      overflow-wrap: anywhere;
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .member-copy strong {
      font-size: 17px;
      font-weight: 800;
      line-height: 1.4;
    }
    .sf-musician-member > .sf-icon-button {
      flex: none;
      border: 1px solid var(--sf-border);
      border-radius: 10px;
    }
    .member-copy small {
      color: var(--sf-muted);
    }
  `,
  template: ` @if (embedded()) {
      <app-surface-card labelledBy="session-musicians-title">
        <div class="sf-session-heading">
          <h2 id="session-musicians-title">Músicos da sessão</h2>
          <button
            class="sf-icon-button"
            type="button"
            aria-label="Atualizar músicos"
            [disabled]="busy()"
            (click)="load()"
          >
            <i class="pi pi-refresh" aria-hidden="true"></i>
          </button>
        </div>
        @if (error() && !revoking()) {
          <p role="alert" class="host-error">{{ error() }}</p>
        }
        <ng-container [ngTemplateOutlet]="content" />
      </app-surface-card>
    } @else {
      <app-confirmation-dialog
        title="Músicos da sessão"
        returnFocus="session-options-button"
        [busy]="busy()"
        [error]="revoking() ? '' : error()"
        (dismissed)="close()"
      >
        <div dialog-actions>
          <app-options-menu
            label="Opções dos músicos"
            buttonId="musicians-options"
            [items]="listMenu"
            [disabled]="busy()"
          />
        </div>
        <ng-container [ngTemplateOutlet]="content" />
      </app-confirmation-dialog>
    }
    <ng-template #content>
      <form class="host-form" [formGroup]="form" (ngSubmit)="grant()">
        <label id="musician-access-label" for="musician-access-select">Músico</label>
        <p-select
          inputId="musician-access-select"
          ariaLabelledBy="musician-access-label"
          ariaFilterLabel="Buscar músico pelo nome"
          formControlName="musicianId"
          [options]="choices()"
          optionLabel="name"
          optionValue="id"
          [filter]="true"
          filterBy="name"
          filterPlaceholder="Buscar pelo nome"
          placeholder="Selecione um músico"
          emptyFilterMessage="Nenhum músico encontrado."
          emptyMessage="Nenhum músico aprovado disponível."
          [readonly]="busy()"
          [loading]="busy()"
          [showClear]="true"
        />
        <div class="sf-dialog-actions">
          <button
            type="submit"
            class="sf-button sf-primary sf-full"
            [disabled]="busy() || form.invalid"
          >
            Liberar acesso
          </button>
          @if (!embedded()) {
            <button
              type="button"
              class="sf-button sf-outline sf-full"
              [disabled]="busy()"
              (click)="close()"
            >
              Fechar
            </button>
          }
        </div>
      </form>
      <h3>Músicos vinculados</h3>
      <ul class="sf-people-list sf-host-people-list" aria-label="Músicos vinculados">
        @for (member of members(); track member.id; let index = $index) {
          <li class="choice-panel sf-musician-member">
            <span class="member-copy"
              ><strong>{{ member.name }}</strong>
              @if (!member.enabled) {
                <small>Acesso indisponível</small>
              }
            </span>
            <button
              type="button"
              class="sf-icon-button"
              [id]="'musician-access-' + index"
              [attr.aria-label]="'Revogar acesso de ' + member.name"
              title="Revogar acesso"
              [disabled]="busy()"
              (click)="askRevoke(member)"
            >
              <i class="pi pi-user-minus" aria-hidden="true"></i>
            </button>
          </li>
        } @empty {
          <li>{{ busy() ? 'Carregando músicos…' : 'Nenhum músico vinculado a esta sessão.' }}</li>
        }
      </ul>

      @if (revoking(); as member) {
        <app-confirmation-dialog
          title="Revogar acesso do músico?"
          returnFocus="musician-access-select"
          [busy]="busy()"
          [error]="error()"
          (dismissed)="revoking.set(null)"
        >
          <p>
            {{ member.name }} deixará de consultar esta sessão. A conta continuará disponível para
            outros eventos.
          </p>
          <div class="sf-dialog-actions">
            <button
              type="button"
              class="sf-button sf-danger"
              [disabled]="busy()"
              (click)="revoke(member)"
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
    </ng-template>`,
})
export class SessionMusicians implements OnInit {
  readonly session = input.required<string>();
  readonly embedded = input(false);
  readonly working = output<boolean>();
  constructor() {
    effect(() => this.working.emit(this.busy()));
  }
  readonly dismissed = output<void>();
  private readonly api = inject(ApiClient);
  private readonly notifications = inject(Notifications);
  readonly form = inject(FormBuilder).nonNullable.group({ musicianId: ['', Validators.required] });
  readonly busy = signal(false);
  readonly error = signal('');
  readonly members = signal<Member[]>([]);
  readonly directory = signal<Musician[]>([]);
  readonly revoking = signal<Member | null>(null);
  readonly choices = computed(() =>
    this.directory().filter(
      (candidate) => !this.members().some((member) => member.id === candidate.id),
    ),
  );
  readonly listMenu: MenuItem[] = [
    { label: 'Atualizar lista', icon: 'pi pi-refresh', command: () => void this.load() },
  ];
  private operation: { musicianId: string; id: string } | null = null;
  private get path() {
    return `/sessions/${this.session()}/musicians`;
  }
  ngOnInit() {
    void this.load();
  }
  async load() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const [members, directory] = await Promise.all([
        this.api.get<Member[]>(this.path),
        this.api.get<Musician[]>(this.path + '/available'),
      ]);
      this.members.set(members);
      this.directory.set(directory);
      this.form.reset();
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
  askRevoke(member: Member) {
    if (this.busy()) return;
    this.error.set('');
    this.revoking.set(member);
  }
  close() {
    if (!this.busy()) this.dismissed.emit();
  }
  async grant() {
    if (this.busy() || this.form.invalid) return;
    const musicianId = this.form.controls.musicianId.value;
    if (this.operation?.musicianId !== musicianId)
      this.operation = { musicianId, id: createOperationId() };
    this.busy.set(true);
    this.error.set('');
    try {
      this.members.set(
        await this.api.post<Member[]>(this.path, { musicianId, operationId: this.operation.id }),
      );
      this.operation = null;
      this.form.reset();
      this.notifications.success('Músico vinculado a esta sessão.');
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
  async revoke(member: Member) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      this.members.set(
        await this.api.post<Member[]>(this.path + '/revoke', { musicianId: member.id }),
      );
      this.revoking.set(null);
      this.notifications.success('Acesso do músico revogado nesta sessão.');
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
