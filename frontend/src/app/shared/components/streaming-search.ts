import { ReferenceLinkInput } from './reference-link-input';
import { NgTemplateOutlet } from '@angular/common';
import { PreparedResource, preparationMessage, hasPreparedResource } from '../enrichment';
import { Component, OnInit, OnDestroy, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ApiClient, apiError } from '../../core/http/api-client';
import { Notifications } from '../notifications';
import { ConfirmationDialog } from './confirmation-dialog';
import {
  StreamingProvider,
  StreamingSong,
  StreamingLink,
  StreamingTrack,
  StreamingPage,
  streamingIcon,
  streamingUrl,
} from '../streaming';
let nextStreamingEditorId = 0;

@Component({
  selector: 'app-streaming-search',
  imports: [
    ReferenceLinkInput,
    NgTemplateOutlet,
    ConfirmationDialog,
    ReactiveFormsModule,
    InputTextModule,
  ],
  styles: `
    .streaming-search {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .streaming-search input {
      flex: 1;
      min-width: 0;
    }
    .streaming-results {
      list-style: none;
      padding: 0;
      margin: 16px 0;
      display: grid;
      gap: 12px;
    }
    .streaming-result {
      border: 1px solid var(--sf-border);
      border-radius: 12px;
      padding: 12px;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .streaming-result.selected {
      border-color: var(--sf-purple, #7c3aed);
      background: #f5f0ff;
    }
    .streaming-result label {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;
      min-height: 48px;
      cursor: pointer;
    }
    .streaming-result input {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }
    .streaming-result strong,
    .streaming-result small {
      display: block;
      overflow-wrap: anywhere;
    }
    .streaming-result small {
      color: var(--sf-muted);
    }
    .streaming-provider {
      display: flex;
      gap: 8px;
      align-items: center;
    }
  `,
  template: ` @if (embedded()) {
      @if (error()) {
        <p class="sf-dialog-error" role="alert">{{ error() }}</p>
      }
      <ng-container [ngTemplateOutlet]="editor" />
    } @else {
      <app-confirmation-dialog
        title="Streaming"
        [busy]="saving()"
        [error]="error()"
        (dismissed)="dismissed.emit()"
      >
        <ng-container [ngTemplateOutlet]="editor" />
      </app-confirmation-dialog>
    }
    <ng-template #editor>
      @if (!embedded()) {
        <p>
          <strong>{{ song().title }}</strong> · {{ song().artist || 'Artista não informado' }}
        </p>
      }

      @if (!providerType() && providers().length > 1) {
        <label [for]="fieldPrefix + '-provider'">Plataforma</label>
        <select
          [id]="fieldPrefix + '-provider'"
          class="sf-input"
          [value]="provider()?.type"
          [disabled]="saving() || disabled()"
          (change)="changeProvider($event)"
        >
          @for (p of providers(); track p.type) {
            <option [value]="p.type">{{ p.label }}</option>
          }
        </select>
      }
      @if (provider(); as p) {
        @if (state(); as link) {
          @if (preparation()) {
            <p role="status">{{ preparation() }}</p>
          }
          @if (preparedAvailable()) {
            <button
              type="button"
              class="sf-button sf-outline sf-full"
              [disabled]="saving() || disabled() || searching()"
              (click)="refreshPrepared()"
            >
              Atualizar sugestões preparadas
            </button>
          }
          <form class="host-form" (submit)="$event.preventDefault(); search()">
            <label [for]="fieldPrefix + '-query'">Buscar música ou artista</label>
            <div class="streaming-search">
              <input
                [id]="fieldPrefix + '-query'"
                pInputText
                [formControl]="query"
                maxlength="321"
                [readOnly]="saving() || disabled()"
                placeholder="Música e artista"
              />
              <button
                type="submit"
                class="sf-icon-button"
                aria-label="Pesquisar no streaming"
                [disabled]="saving() || disabled() || searching() || query.value.trim().length < 3"
              >
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
              </button>
            </div>
          </form>
          @if (searching()) {
            <p role="status">Buscando no {{ p.label }}…</p>
          }
          @if (searchError()) {
            <p class="sf-dialog-error" role="alert">{{ searchError() }}</p>
          }
          <ul class="streaming-results" aria-label="Versões encontradas">
            @for (row of results(); track row.id) {
              <li class="streaming-result" [class.selected]="urlControl.value === row.url">
                <label
                  ><input
                    type="radio"
                    [name]="fieldPrefix + '-choice'"
                    [checked]="urlControl.value === row.url"
                    [disabled]="saving() || disabled()"
                    (change)="choose(row.url)"
                  />
                  <span
                    ><strong>{{ row.title }}</strong
                    ><small>{{ row.artist }}</small
                    ><small
                      >{{ row.album }}
                      @if (row.durationMs) {
                        · {{ duration(row.durationMs) }}
                      }
                    </small></span
                  ></label
                >
                <a
                  class="sf-icon-button"
                  [href]="safe(row.url)"
                  target="_blank"
                  rel="noopener noreferrer"
                  [attr.aria-label]="'Conferir ' + row.title + ' no ' + p.label"
                  ><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i
                ></a>
              </li>
            }
          </ul>
          @if (searched() && !searching() && !searchError() && !results().length) {
            <p>Nenhuma versão encontrada. Você pode informar o link abaixo.</p>
          }
          @if (hasMore()) {
            <button
              type="button"
              class="sf-button sf-outline sf-full"
              [disabled]="saving() || disabled() || searching()"
              (click)="search(true)"
            >
              Carregar mais
            </button>
          }
          <form class="host-form" (submit)="$event.preventDefault(); save()">
            <app-reference-link-input
              [fieldId]="fieldPrefix + '-url'"
              label="Link da música"
              [control]="urlControl"
              [href]="safe(urlControl.value)"
              [busy]="saving() || disabled()"
            />
            @if (urlControl.invalid && urlControl.dirty) {
              <p class="sf-dialog-error" role="alert">
                Informe o link HTTPS de uma música no {{ p.label }}.
              </p>
            }
            @if (!embedded()) {
              <ng-container [ngTemplateOutlet]="editorActions" />
            }
          </form>
        }
      }
    </ng-template>
    <ng-template #editorActions>
      @if (state(); as link) {
        <div class="sf-dialog-actions">
          <button
            type="button"
            (click)="save()"
            class="sf-button sf-primary sf-full"
            [disabled]="saving() || urlControl.invalid || !safe(urlControl.value)"
          >
            Salvar referência
          </button>
          @if (link.url) {
            <button
              type="button"
              class="sf-button sf-outline sf-full"
              [disabled]="saving() || disabled()"
              (click)="save(true)"
            >
              Remover referência
            </button>
          }
          @if (!embedded()) {
            <button
              type="button"
              class="sf-button sf-outline sf-full"
              [disabled]="saving() || disabled()"
              (click)="dismissed.emit()"
            >
              Voltar
            </button>
          }
        </div>
      }
    </ng-template>`,
})
export class StreamingSearch implements OnInit, OnDestroy {
  readonly fieldPrefix = `streaming-editor-${++nextStreamingEditorId}`;
  readonly providerType = input<string>();
  readonly initialLinks = input<StreamingLink[]>();
  readonly draftUrl = input<string>();
  readonly draftChanged = output<{ url: string; valid: boolean }>();
  readonly saveRequested = output<void>();
  readonly disabled = input(false);
  readonly embedded = input(false);
  readonly busyChange = output<boolean>();
  readonly song = input.required<StreamingSong>();
  readonly saved = output<StreamingLink>();
  readonly dismissed = output<void>();
  private readonly api = inject(ApiClient);
  private readonly notify = inject(Notifications);
  readonly providers = signal<StreamingProvider[]>([]);
  readonly provider = signal<StreamingProvider | null>(null);
  readonly state = signal<StreamingLink | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly searchError = signal('');
  readonly preparation = signal('');
  readonly preparedAvailable = signal(false);
  readonly searching = signal(false);
  readonly searched = signal(false);
  readonly results = signal<StreamingTrack[]>([]);
  readonly hasMore = signal(false);
  readonly query = new FormControl('', { nonNullable: true });
  readonly urlControl = new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.maxLength(2048),
      (c) => (!c.value || this.safe(c.value) ? null : { url: true }),
    ],
  });
  readonly icon = streamingIcon;
  private readonly draftSubscription = this.urlControl.valueChanges.subscribe((url) => {
    if (this.embedded()) this.draftChanged.emit({ url, valid: this.urlControl.valid });
  });
  private readonly lookupAbort = new AbortController();
  private destroyed = false;
  private generation = 0;
  private page = 0;
  private searchedQuery = '';
  private get base() {
    return (
      '/admin/catalog/songs/' +
      this.song().id +
      '/streaming/' +
      encodeURIComponent(this.provider()!.type)
    );
  }
  safe(value: string | null) {
    return streamingUrl(this.provider()?.type ?? '', value);
  }
  duration(ms: number) {
    const seconds = Math.floor(ms / 1000);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
  async ngOnInit() {
    this.query.setValue((this.song().title + ' ' + (this.song().artist ?? '')).trim());
    try {
      const providers =
        this.initialLinks() ??
        (await this.api.get<StreamingProvider[]>('/admin/catalog/streaming/providers', {
          signal: this.lookupAbort.signal,
        }));
      if (this.destroyed) return;
      this.providers.set(providers);
      if (!providers.length) {
        this.error.set('Nenhuma plataforma disponível.');
        this.loading.set(false);
        return;
      }
      const provider =
        providers.find((p) => p.type === this.providerType()) ??
        (!this.providerType() ? providers[0] : null);
      if (!provider) {
        this.error.set('Plataforma indisponível.');
        this.loading.set(false);
        return;
      }
      await this.load(provider);
    } catch (e) {
      if (!this.destroyed) {
        this.error.set(apiError(e));
        this.loading.set(false);
      }
    }
  }
  ngOnDestroy() {
    this.draftSubscription.unsubscribe();
    this.destroyed = true;
    this.lookupAbort.abort();
    this.generation++;
  }
  changeProvider(event: Event) {
    const type = (event.target as HTMLSelectElement).value;
    const provider = this.providers().find((p) => p.type === type);
    if (provider && !this.saving()) void this.load(provider);
  }
  private async load(provider: StreamingProvider) {
    const draft = this.draftUrl();
    const generation = ++this.generation;
    this.provider.set(provider);
    this.loading.set(true);
    this.state.set(null);
    this.preparation.set('');
    this.preparedAvailable.set(false);
    this.results.set([]);
    this.hasMore.set(false);
    this.error.set('');
    this.searchError.set('');
    this.searching.set(false);
    this.searched.set(false);
    this.urlControl.reset('');
    try {
      const state =
        this.initialLinks()?.find((link) => link.type === provider.type) ??
        (await this.api.get<StreamingLink>(this.base, {
          signal: this.lookupAbort.signal,
        }));
      if (this.destroyed || generation !== this.generation) return;
      this.state.set(state);
      this.urlControl.setValue(draft ?? state.url ?? '');
      this.loading.set(false);
      // Opening an existing reference must not consume provider search quota.
      // The search form remains available for an explicit replacement.
      if (draft === undefined && !state.url && !(await this.loadPrepared())) await this.search();
    } catch (e) {
      if (!this.destroyed && generation === this.generation) this.error.set(apiError(e));
    } finally {
      if (!this.destroyed && generation === this.generation) this.loading.set(false);
    }
  }
  async refreshPrepared() {
    await this.loadPrepared();
  }
  private async loadPrepared() {
    const generation = ++this.generation;
    const type = this.provider()!.type;
    const q = this.query.value.trim();
    this.searching.set(true);
    try {
      const prepared = await this.api.get<PreparedResource>(
        `/admin/catalog/songs/${this.song().id}/enrichment/${encodeURIComponent(type)}`,
        { signal: this.lookupAbort.signal },
      );
      if (this.destroyed || generation !== this.generation || q !== this.query.value.trim())
        return true;
      if (!hasPreparedResource(prepared) || prepared.type !== type) return false;
      this.preparedAvailable.set(true);
      this.preparation.set(preparationMessage(prepared));
      this.results.set(prepared.candidates.filter((c) => c.type === type && !!this.safe(c.url)));
      this.hasMore.set(false);
      this.searched.set(['READY', 'NOT_FOUND'].includes(prepared.state));
      this.searchError.set('');
      return true;
    } catch {
      return false;
    } finally {
      if (!this.destroyed && generation === this.generation) this.searching.set(false);
    }
  }
  choose(url: string) {
    this.urlControl.setValue(url);
    this.urlControl.markAsDirty();
  }
  async search(append = false) {
    const q = this.query.value.trim();
    if (q.length < 3 || this.saving() || this.searching() || !this.state()) return;
    if (append && q !== this.searchedQuery) append = false;
    const generation = ++this.generation;
    this.searching.set(true);
    this.searchError.set('');
    this.preparation.set('');
    if (!append) {
      this.results.set([]);
      this.hasMore.set(false);
      this.page = 0;
    }
    try {
      const result = await this.api.get<StreamingPage>(
        this.base + '/search?q=' + encodeURIComponent(q) + '&page=' + (append ? this.page + 1 : 1),
        { signal: this.lookupAbort.signal },
      );
      if (this.destroyed || generation !== this.generation || q !== this.query.value.trim()) return;
      if (result.provider.type !== this.provider()?.type) throw new Error('Unexpected provider');
      const rows = result.items.filter(
        (row) => row.type === this.provider()?.type && !!this.safe(row.url),
      );
      this.results.set([
        ...new Map(
          [...(append ? this.results() : []), ...rows].map((row) => [row.id, row]),
        ).values(),
      ]);
      this.page = result.page;
      this.hasMore.set(result.hasMore);
      this.searchedQuery = q;
      this.searched.set(true);
    } catch (e) {
      if (!this.destroyed && generation === this.generation)
        this.searchError.set(
          e instanceof HttpErrorResponse && e.error?.detail
            ? e.error.detail
            : 'A busca está indisponível. Informe o link manualmente.',
        );
    } finally {
      if (!this.destroyed && generation === this.generation) this.searching.set(false);
    }
  }
  async save(reset = false) {
    if (this.embedded()) {
      this.saveRequested.emit();
      return;
    }
    const state = this.state();
    if (
      !state ||
      this.saving() ||
      (!reset && (this.urlControl.invalid || !this.safe(this.urlControl.value)))
    )
      return;
    this.generation++;
    this.searching.set(false);
    this.saving.set(true);
    this.busyChange.emit(true);
    this.error.set('');
    try {
      const link = await this.api.post<StreamingLink>(this.base, {
        version: state.version,
        url: reset ? null : this.urlControl.value.trim(),
      });
      if (this.destroyed) return;
      this.notify.success('Referência de streaming atualizada.');
      this.state.set(link);
      this.urlControl.reset(link.url ?? '');
      this.results.set([]);
      this.hasMore.set(false);
      this.searched.set(false);
      this.saved.emit(link);
      if (!this.embedded()) this.dismissed.emit();
    } catch (e) {
      if (!this.destroyed) this.error.set(apiError(e));
    } finally {
      if (!this.destroyed) {
        this.saving.set(false);
        this.busyChange.emit(false);
      }
    }
  }
}
