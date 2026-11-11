import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DatePipe, DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { InputTextModule } from 'primeng/inputtext';
import { ApiClient, apiError } from '../../core/http/api-client';
import { KaraokeSession } from '../sessions/session-api';
import { StageView } from '../stage/stage-api';
import { SurfaceCard } from '../../shared/components/surface-card';
import { OptionsMenu } from '../../shared/components/options-menu';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import { StatusBadge } from '../../shared/components/status-badge';

interface Summary {
  session: KaraokeSession;
  host: { name: string; email: string };
}
interface Detail extends Summary {
  musicians: { id: string; name: string; enabled: boolean }[];
  stage: StageView;
}
@Component({
  selector: 'app-admin-sessions',
  imports: [SurfaceCard, OptionsMenu, ConfirmationDialog, StatusBadge, InputTextModule, DatePipe],
  styles: `
    :host {
      display: block;
    }
    .session-heading {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .session-heading h1 {
      margin: 0;
    }
    .session-search {
      display: grid;
      gap: 8px;
      margin-top: 24px;
    }
    .session-search input {
      width: 100%;
      min-height: var(--sf-touch);
    }
    .session-section {
      padding-top: 20px;
      margin-top: 20px;
      border-top: 1px solid var(--sf-border);
    }
    .session-section h3 {
      margin: 0 0 12px;
    }
    .session-section p {
      margin: 8px 0;
    }
    .session-current {
      padding: 16px;
      border-radius: 12px;
      background: #f1eafe;
    }
    .session-current strong {
      display: block;
      margin: 12px 0 6px;
    }
    .session-queue {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .session-queue li {
      display: grid;
      grid-template-columns: 28px minmax(0, 1fr);
      gap: 12px;
      padding: 14px 0;
      border-bottom: 1px solid var(--sf-border);
    }
    .session-queue p {
      margin: 4px 0 0;
    }
    .session-position {
      display: grid;
      place-items: center;
      align-self: start;
      min-height: 28px;
      border-radius: 8px;
      background: #f1eafe;
      color: var(--sf-purple);
      font-weight: 750;
    }
    .session-empty {
      padding: 24px 0;
      text-align: center;
      color: var(--sf-muted);
    }
  `,
  template: `
    <app-surface-card labelledBy="admin-sessions-title">
      <div class="session-heading">
        <h1 id="admin-sessions-title" tabindex="-1">Sessões abertas</h1>
        <app-options-menu
          buttonId="admin-sessions-options"
          label="Opções das sessões"
          [items]="listMenu"
          [disabled]="loading()"
        />
      </div>
      <p>Acompanhe os eventos em andamento. Esta área é somente de consulta.</p>
      @if (error() && !selected()) {
        <p role="alert" class="sf-dialog-error">{{ error() }}</p>
      }
      <label class="session-search"
        >Buscar sessão ou anfitrião<input
          pInputText
          [value]="search()"
          (input)="search.set($any($event.target).value)"
          placeholder="Nome da sessão ou anfitrião"
      /></label>
      <p role="status">
        {{ loading() ? 'Atualizando sessões…' : filtered().length + ' sessão(ões) aberta(s)' }}
      </p>
      <ul class="sf-people-list">
        @for (item of filtered(); track item.session.id) {
          <li>
            <button
              type="button"
              class="sf-person-row"
              [id]="'admin-session-' + item.session.id"
              (click)="open(item)"
            >
              <span
                ><strong>{{ item.session.name }}</strong
                ><span>{{ item.host.name || item.host.email }}</span
                ><span>Aberta · {{ item.session.createdAt | date: 'dd/MM HH:mm' }}</span></span
              ><i class="pi pi-chevron-right" aria-hidden="true"></i>
            </button>
          </li>
        } @empty {
          <li class="session-empty">
            {{
              search() ? 'Nenhuma sessão corresponde à busca.' : 'Nenhuma sessão aberta no momento.'
            }}
          </li>
        }
      </ul>
    </app-surface-card>
    @if (selected(); as selected) {
      <app-confirmation-dialog
        [title]="selected.session.name"
        [returnFocus]="'admin-session-' + selected.session.id"
        (dismissed)="close()"
      >
        <div dialog-actions>
          <app-options-menu
            buttonId="admin-session-view-options"
            label="Opções da consulta"
            [items]="detailMenu"
            [disabled]="reading()"
          />
        </div>
        @if (error()) {
          <p role="alert" class="sf-dialog-error">{{ error() }}</p>
        }
        @if (detail(); as view) {
          <app-status-badge tone="positive">Sessão aberta</app-status-badge>
          <p>Consulta administrativa · Atualizado às {{ updatedAt() | date: 'HH:mm:ss' }}</p>
          <section class="session-section" aria-label="Anfitrião da sessão">
            <h3>Anfitrião</h3>
            <strong>{{ view.host.name || view.host.email }}</strong>
            @if (view.host.name) {
              <p>{{ view.host.email }}</p>
            }
          </section>
          <section class="session-section" aria-label="Músicos da sessão">
            <h3>Músicos</h3>
            @for (member of view.musicians; track member.id) {
              <p>
                <strong>{{ member.name }}</strong>
                @if (!member.enabled) {
                  · Acesso indisponível
                }
              </p>
            } @empty {
              <p>Nenhum músico vinculado.</p>
            }
          </section>
          <section class="session-section" aria-label="Convocação atual">
            <h3>No palco agora</h3>
            @if (view.stage.active; as active) {
              <div class="session-current">
                <app-status-badge tone="attention">{{
                  active.acceptedAt ? 'Ida confirmada' : 'Convocado'
                }}</app-status-badge
                ><strong>{{ active.participantName }}</strong>
                <p>
                  {{ active.title || 'Música a escolher' }}
                  @if (active.artist) {
                    · {{ active.artist }}
                  }
                </p>
              </div>
            } @else {
              <p>Nenhuma convocação ativa.</p>
            }
          </section>
          <section class="session-section" aria-label="Fila sugerida">
            <h3>Fila sugerida ({{ view.stage.suggestions.length }})</h3>
            <p>A ordem pode mudar até a confirmação pelo anfitrião.</p>
            <ol class="session-queue">
              @for (
                person of view.stage.suggestions;
                track person.participantId;
                let index = $index
              ) {
                <li>
                  <span class="session-position">{{ index + 1 }}</span>
                  <div>
                    <strong>{{ person.name }}</strong>
                    <p>
                      {{ person.title || 'Música a escolher' }}
                      @if (person.artist) {
                        · {{ person.artist }}
                      }
                    </p>
                    <p>
                      {{ person.completed }} apresentações
                      @if (person.tableLabel) {
                        · Mesa {{ person.tableLabel }}
                      }
                    </p>
                  </div>
                </li>
              } @empty {
                <li>Ninguém aguardando na fila sugerida.</li>
              }
            </ol>
          </section>
          @if (view.stage.waits.length) {
            <section class="session-section" aria-label="Aguardando retorno">
              <h3>Aguardando retorno</h3>
              @for (person of view.stage.waits; track person.participantId) {
                <p>
                  {{ person.name }} ·
                  {{
                    person.manualRelease
                      ? 'Aguarda liberação do anfitrião'
                      : 'Aguarda nova oportunidade'
                  }}
                </p>
              }
            </section>
          }
        } @else if (reading()) {
          <p role="status">Carregando dados da sessão…</p>
        }
        <div class="sf-dialog-actions">
          <button type="button" class="sf-button sf-outline sf-full" (click)="close()">
            Fechar
          </button>
        </div>
      </app-confirmation-dialog>
    }
  `,
})
export class AdminSessions implements OnInit, OnDestroy {
  private readonly api = inject(ApiClient);
  private readonly document = inject(DOCUMENT);
  readonly sessions = signal<Summary[]>([]);
  readonly selected = signal<Summary | null>(null);
  readonly detail = signal<Detail | null>(null);
  readonly loading = signal(false);
  readonly reading = signal(false);
  readonly error = signal('');
  readonly search = signal('');
  readonly updatedAt = signal<Date | null>(null);
  readonly filtered = computed(() => {
    const q = this.search().trim().toLocaleLowerCase();
    return this.sessions().filter((s) =>
      (s.session.name + ' ' + s.host.name + ' ' + s.host.email).toLocaleLowerCase().includes(q),
    );
  });
  readonly listMenu = [
    { label: 'Atualizar lista', icon: 'pi pi-refresh', command: () => void this.load() },
  ];
  readonly detailMenu = [
    { label: 'Atualizar consulta', icon: 'pi pi-refresh', command: () => void this.refresh() },
  ];
  private timer?: ReturnType<typeof setInterval>;
  private generation = 0;
  private destroyed = false;
  ngOnInit() {
    void this.load();
    this.timer = setInterval(() => {
      if (!this.document.hidden && this.selected()) void this.refresh();
    }, 4000);
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.generation++;
    clearInterval(this.timer);
  }
  async load() {
    if (this.loading() || this.destroyed) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const list = await this.api.get<Summary[]>('/admin/sessions');
      if (!this.destroyed) this.sessions.set(list);
    } catch (error) {
      if (!this.destroyed) {
        this.error.set(apiError(error));
        if (error instanceof HttpErrorResponse && [401, 403].includes(error.status)) {
          this.sessions.set([]);
          this.detail.set(null);
        }
      }
    } finally {
      this.loading.set(false);
    }
  }
  open(item: Summary) {
    this.generation++;
    this.selected.set(item);
    this.detail.set(null);
    this.reading.set(false);
    this.updatedAt.set(null);
    this.error.set('');
    void this.refresh();
  }
  close() {
    this.generation++;
    this.selected.set(null);
    this.detail.set(null);
    this.error.set('');
    this.reading.set(false);
  }
  async refresh() {
    const selected = this.selected();
    if (!selected || this.reading() || this.destroyed) return;
    const generation = this.generation;
    this.reading.set(true);
    try {
      const detail = await this.api.get<Detail>('/admin/sessions/' + selected.session.id);
      if (generation !== this.generation || this.destroyed) return;
      this.detail.set(detail);
      this.error.set('');
      this.updatedAt.set(new Date());
    } catch (error) {
      if (generation !== this.generation || this.destroyed) return;
      this.error.set(apiError(error));
      if (error instanceof HttpErrorResponse && [401, 403, 404, 409].includes(error.status)) {
        this.detail.set(null);
        if (error.status === 409)
          this.error.set('Esta sessão foi encerrada. Atualize a lista de sessões abertas.');
      }
    } finally {
      if (generation === this.generation && !this.destroyed) this.reading.set(false);
    }
  }
}
