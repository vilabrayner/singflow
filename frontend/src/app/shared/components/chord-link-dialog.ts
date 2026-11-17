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
export interface ChordSong {
  id: string;
  title: string;
  artist: string | null;
}
export interface ChordLink {
  songId: string;
  officialUrl: string | null;
  version: number;
  personalUrl: string | null;
  personalVersion: number;
  effectiveUrl: string | null;
  source: string;
  alternatives: string[];
}
interface Candidate {
  id: string;
  title: string;
  artist: string;
  url: string;
  verified: boolean;
  recommended: boolean;
}
interface SearchPage {
  items: Candidate[];
  page: number;
  hasMore: boolean;
}
/** Shared picker; authorization and persistence scope always belong to the backend endpoint. */
@Component({
  selector: 'app-chord-link-dialog',
  imports: [
    ReferenceLinkInput,
    NgTemplateOutlet,
    ConfirmationDialog,
    ReactiveFormsModule,
    InputTextModule,
  ],
  styles: `
    .chord-search {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .chord-search input {
      min-width: 0;
      flex: 1;
    }
    .chord-results {
      display: grid;
      gap: 12px;
      list-style: none;
      padding: 0;
      margin: 16px 0;
    }
    .chord-result {
      border: 1px solid var(--sf-border);
      border-radius: 12px;
      padding: 12px;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .chord-result label {
      display: flex;
      gap: 12px;
      align-items: center;
      flex: 1;
      min-height: 48px;
      cursor: pointer;
      min-width: 0;
    }
    .chord-result input {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }
    .chord-result strong,
    .chord-result small {
      display: block;
      overflow-wrap: anywhere;
    }
    .chord-result.selected {
      border-color: var(--sf-purple, #7c3aed);
      background: #f5f0ff;
    }
    .chord-info {
      padding: 12px;
      background: var(--sf-surface-muted, #f4f6fa);
      border-radius: 12px;
    }
    .chord-results small {
      color: var(--sf-muted);
    }
  `,
  template: ` @if (embedded()) {
      @if (error()) {
        <p class="sf-dialog-error" role="alert">{{ error() }}</p>
      }
      <ng-container [ngTemplateOutlet]="editor" />
    } @else {
      <app-confirmation-dialog
        [title]="mode() === 'admin' ? 'Cifra oficial' : 'Minha cifra'"
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
        @if (mode() === 'musician') {
          <p class="chord-info">
            Sua escolha fica no seu perfil para esta música, em todas as sessões. A referência do
            catálogo não muda.
          </p>
        }
      }

      @if (state(); as link) {
        @if (mode() === 'musician' && link.alternatives.length) {
          <p role="status">A unificação trouxe outras escolhas suas. Confira qual deseja manter.</p>
          @for (url of link.alternatives; track url) {
            <button
              type="button"
              class="sf-button sf-outline sf-full"
              [disabled]="saving() || disabled()"
              (click)="choose(url)"
            >
              {{ url }}
            </button>
          }
        }
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
          <label for="chord-search">Buscar cifra</label>
          <div class="chord-search">
            <input
              id="chord-search"
              pInputText
              [formControl]="query"
              maxlength="321"
              placeholder="Música e artista"
              [readOnly]="saving() || disabled()"
            /><button
              type="submit"
              class="sf-icon-button"
              aria-label="Pesquisar cifras"
              [disabled]="searching() || saving() || disabled() || query.value.trim().length < 3"
            >
              <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            </button>
          </div>
        </form>
        @if (searching()) {
          <p role="status">Buscando correspondências…</p>
        }
        @if (searchError()) {
          <p class="sf-dialog-error" role="alert">{{ searchError() }}</p>
        }
        <ul class="chord-results" aria-label="Correspondências de cifras">
          @for (row of results(); track row.url) {
            <li class="chord-result" [class.selected]="urlControl.value === row.url">
              <label
                ><input
                  type="radio"
                  name="chord-choice"
                  [checked]="urlControl.value === row.url"
                  [disabled]="saving() || disabled()"
                  (change)="choose(row.url)"
                /><span
                  ><strong>{{ row.title }}</strong
                  ><small>{{ row.artist }}</small>
                  @if (row.recommended) {
                    <small>Sugestão principal do Cifra Club</small>
                  }
                </span></label
              >
              <a
                class="sf-icon-button"
                [href]="safe(row.url)"
                target="_blank"
                rel="noopener noreferrer"
                [attr.aria-label]="'Conferir cifra de ' + row.title + ' — ' + row.artist"
                ><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i
              ></a>
            </li>
          }
        </ul>
        @if (searched() && !searching() && !searchError() && !results().length) {
          <p>Nenhuma correspondência encontrada. Você pode informar o link abaixo.</p>
        }
        @if (hasMore()) {
          <button
            type="button"
            class="sf-button sf-outline sf-full"
            [disabled]="searching() || saving() || disabled()"
            (click)="search(true)"
          >
            Carregar mais
          </button>
        }
        <form class="host-form" (submit)="$event.preventDefault(); save()">
          <app-reference-link-input
            fieldId="chord-url"
            label="Link da cifra"
            [control]="urlControl"
            [href]="safe(urlControl.value)"
            [busy]="saving() || disabled()"
          />
          @if (urlControl.invalid && urlControl.dirty) {
            <p class="sf-dialog-error" role="alert">
              Informe um link HTTPS de uma música no Cifra Club.
            </p>
          }
          @if (!embedded()) {
            <ng-container [ngTemplateOutlet]="editorActions" />
          }
        </form>
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
            {{ mode() === 'admin' ? 'Salvar referência oficial' : 'Salvar minha preferência' }}
          </button>
          @if (mode() === 'musician' && (link.personalUrl || link.alternatives.length)) {
            <button
              type="button"
              class="sf-button sf-outline sf-full"
              [disabled]="saving() || disabled()"
              (click)="save(true)"
            >
              Usar referência do catálogo
            </button>
          }
          @if (mode() === 'admin' && link.officialUrl) {
            <button
              type="button"
              class="sf-button sf-outline sf-full"
              [disabled]="saving() || disabled()"
              (click)="save(true)"
            >
              Remover referência oficial
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
export class ChordLinkDialog implements OnInit, OnDestroy {
  readonly initialState = input<ChordLink>();
  readonly draftUrl = input<string>();
  readonly draftChanged = output<{ url: string; valid: boolean }>();
  readonly saveRequested = output<void>();
  readonly disabled = input(false);
  readonly embedded = input(false);
  readonly busyChange = output<boolean>();
  readonly song = input.required<ChordSong>();
  readonly mode = input<'admin' | 'musician'>('admin');
  readonly session = input('');
  readonly dismissed = output<void>();
  readonly saved = output<ChordLink>();
  private readonly api = inject(ApiClient);
  private readonly notify = inject(Notifications);
  readonly state = signal<ChordLink | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly searchError = signal('');
  readonly preparation = signal('');
  readonly preparedAvailable = signal(false);
  readonly searching = signal(false);
  readonly searched = signal(false);
  readonly results = signal<Candidate[]>([]);
  readonly hasMore = signal(false);
  readonly query = new FormControl('', { nonNullable: true });
  readonly urlControl = new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.maxLength(2048),
      (control) => (!control.value || this.safe(control.value) ? null : { url: true }),
    ],
  });
  private readonly draftSubscription = this.urlControl.valueChanges.subscribe((url) => {
    if (this.embedded()) this.draftChanged.emit({ url, valid: this.urlControl.valid });
  });
  private readonly lookupAbort = new AbortController();
  private destroyed = false;
  private generation = 0;
  private page = 0;
  private searchedQuery = '';
  private get base() {
    return this.mode() === 'admin'
      ? `/admin/catalog/songs/${this.song().id}/chords`
      : `/musicians/sessions/${this.session()}/songs/${this.song().id}/chords`;
  }
  async ngOnInit() {
    this.query.setValue(`${this.song().title} ${this.song().artist ?? ''}`.trim());
    const draft = this.draftUrl();
    try {
      const state =
        this.initialState() ??
        (await this.api.get<ChordLink>(this.base, { signal: this.lookupAbort.signal }));
      if (this.destroyed) return;
      this.state.set(state);
      this.urlControl.setValue(
        draft ??
          (this.mode() === 'admin'
            ? (state.officialUrl ?? '')
            : (state.personalUrl ?? state.officialUrl ?? '')),
      );
      if (
        draft === undefined &&
        !this.urlControl.value &&
        (this.mode() !== 'admin' || !(await this.loadPrepared()))
      )
        await this.search();
    } catch (e) {
      if (!this.destroyed) this.error.set(apiError(e));
    } finally {
      if (!this.destroyed) this.loading.set(false);
    }
  }
  async refreshPrepared() {
    await this.loadPrepared();
  }
  private async loadPrepared() {
    const generation = ++this.generation;
    const q = this.query.value.trim();
    this.searching.set(true);
    try {
      const prepared = await this.api.get<PreparedResource>(
        `/admin/catalog/songs/${this.song().id}/enrichment/cifra`,
        { signal: this.lookupAbort.signal },
      );
      if (this.destroyed || generation !== this.generation || q !== this.query.value.trim())
        return true;
      if (!hasPreparedResource(prepared)) return false;
      this.preparedAvailable.set(true);
      this.preparation.set(preparationMessage(prepared));
      const rows = prepared.candidates
        .filter((c) => !!this.safe(c.url))
        .map((c) => ({ ...c, verified: false }));
      this.results.set(rows);
      this.hasMore.set(false);
      this.searched.set(['READY', 'NOT_FOUND'].includes(prepared.state));
      this.searchError.set('');
      if (!this.urlControl.dirty && !this.state()?.effectiveUrl) {
        const top = rows.find((c) => c.recommended);
        if (top) this.urlControl.setValue(top.url);
      }
      return true;
    } catch {
      return false;
    } finally {
      if (!this.destroyed && generation === this.generation) this.searching.set(false);
    }
  }
  ngOnDestroy() {
    this.draftSubscription.unsubscribe();
    this.destroyed = true;
    this.lookupAbort.abort();
    this.generation++;
  }
  safe(value: string | null): string | null {
    if (!value) return null;
    try {
      const url = new URL(value);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        !['cifraclub.com.br', 'www.cifraclub.com.br'].includes(url.hostname) ||
        !/^\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9-]+\.html)?\/?$/.test(
          url.pathname,
        ) ||
        ['blog', 'academy', 'explorar', 'assine', 'mais'].includes(url.pathname.split('/')[1])
      )
        return null;
      return url.href;
    } catch {
      return null;
    }
  }
  choose(url: string) {
    this.urlControl.setValue(url);
    this.urlControl.markAsDirty();
  }
  async search(append = false) {
    const q = this.query.value.trim();
    if (q.length < 3 || this.saving() || this.searching()) return;
    if (append && q !== this.searchedQuery) {
      append = false;
    }
    const generation = ++this.generation;
    this.searching.set(true);
    this.searchError.set('');
    this.preparation.set('');
    if (!append) {
      this.results.set([]);
      this.hasMore.set(false);
      this.page = 0;
      if (!this.urlControl.dirty && !this.state()?.effectiveUrl) this.urlControl.setValue('');
    }
    try {
      const result = await this.api.get<SearchPage>(
        `${this.base}/search?q=${encodeURIComponent(q)}&page=${append ? this.page + 1 : 1}`,
        { signal: this.lookupAbort.signal },
      );
      if (this.destroyed || generation !== this.generation || q !== this.query.value.trim()) return;
      const rows = result.items.filter((item) => !!this.safe(item.url));
      this.results.set([
        ...new Map(
          [...(append ? this.results() : []), ...rows].map((item) => [item.url, item]),
        ).values(),
      ]);
      this.hasMore.set(result.hasMore);
      this.page = result.page;
      this.searchedQuery = q;
      this.searched.set(true);
      if (!append && !this.urlControl.dirty && !this.state()?.effectiveUrl) {
        const recommended = rows.find((row) => row.recommended);
        if (recommended) this.urlControl.setValue(recommended.url);
      }
    } catch (e) {
      if (!this.destroyed && generation === this.generation)
        this.searchError.set(
          e instanceof HttpErrorResponse && e.error?.detail
            ? e.error.detail
            : 'A busca de cifras está indisponível. Informe o link manualmente.',
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
    this.saving.set(true);
    this.busyChange.emit(true);
    this.generation++;
    this.searching.set(false);
    this.error.set('');
    try {
      const updated = await this.api.post<ChordLink>(this.base, {
        version: this.mode() === 'admin' ? state.version : state.personalVersion,
        url: reset ? null : this.urlControl.value.trim(),
      });
      if (this.destroyed) return;
      this.notify.success(
        this.mode() === 'admin'
          ? 'Referência de cifra atualizada.'
          : 'Preferência de cifra atualizada.',
      );
      this.state.set(updated);
      this.urlControl.reset(
        this.mode() === 'admin'
          ? (updated.officialUrl ?? '')
          : (updated.personalUrl ?? updated.officialUrl ?? ''),
      );
      this.results.set([]);
      this.hasMore.set(false);
      this.searched.set(false);
      this.saved.emit(updated);
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
