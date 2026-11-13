import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  input,
  output,
  signal,
  viewChild,
  TemplateRef,
} from '@angular/core';
import { ScrollAreaModule } from 'primeng/scrollarea';
import { InputTextModule } from 'primeng/inputtext';
import { ApiClient } from '../../core/http/api-client';

export interface PickedSong {
  title: string;
  artist: string;
  source?: string;
  selectionToken?: string | null;
}
@Component({
  selector: 'app-catalog-song-picker',
  imports: [InputTextModule, NgTemplateOutlet, ScrollAreaModule],
  host: { '[class.picker-scroll-results]': 'scrollResults()' },
  template: `
    <ng-template #searchField>
      <div class="picker-search">
        <input
          id="participant-catalog-search"
          aria-label="Buscar música ou artista"
          pInputText
          [value]="query()"
          (input)="search($any($event.target).value)"
          placeholder="Digite a música para buscar"
          maxlength="160"
          [readOnly]="disabled()"
        />
      </div>
      <p class="picker-hint" role="status" aria-live="polite">
        {{ loading() ? 'Buscando músicas…' : message() }}
      </p>
    </ng-template>
    @if (!externalSearch()) {
      <ng-container [ngTemplateOutlet]="searchField" />
    }
    <ng-template #resultsContent>
      <ul class="picker-list" aria-label="Resultados de músicas" [attr.aria-busy]="loading()">
        @for (song of songs(); track $index) {
          <li [class.picker-already-added]="isAdded(song)">
            <div>
              <strong>{{ song.title }}</strong
              ><span>{{ song.artist || 'Artista não informado' }}</span
              ><small>{{ song.source === 'LASTFM' ? 'Internet' : 'Catálogo' }}</small>
            </div>
            @if (isAdded(song)) {
              <span
                class="picker-added-check"
                role="img"
                [attr.aria-label]="
                  'Já adicionada: ' + song.title + ' — ' + (song.artist || 'Artista não informado')
                "
                title="Música já adicionada aos seus pedidos"
                ><i class="pi pi-check" aria-hidden="true"></i
              ></span>
            } @else {
              <button
                type="button"
                class="sf-button sf-primary picker-add"
                [attr.aria-label]="
                  actionLabel() +
                  ' ' +
                  song.title +
                  ' — ' +
                  (song.artist || 'Artista não informado')
                "
                [attr.title]="actionLabel() + ' música'"
                [disabled]="disabled() || loading()"
                (click)="choose(song)"
              >
                <i [class]="'pi ' + actionIcon()" aria-hidden="true"></i>
              </button>
            }
          </li>
        }
      </ul>
      @if (incremental() && hasMore()) {
        <button
          type="button"
          class="sf-button sf-outline sf-full"
          [disabled]="loading() || disabled()"
          (click)="loadMore()"
        >
          {{ loading() ? 'Carregando…' : 'Carregar mais' }}
        </button>
      }
      @if (!incremental() && !query().trim() && total() > 20) {
        <div class="picker-pagination">
          <button
            type="button"
            class="sf-button sf-outline"
            [disabled]="page() === 0 || loading() || disabled()"
            (click)="browse(page() - 1)"
          >
            Anterior</button
          ><span>{{ page() + 1 }}</span
          ><button
            type="button"
            class="sf-button sf-outline"
            [disabled]="(page() + 1) * 20 >= total() || loading() || disabled()"
            (click)="browse(page() + 1)"
          >
            Próxima
          </button>
        </div>
      }

      @if (inlineManual() && query().trim() && !loading()) {
        <section class="picker-manual" aria-label="Adicionar música manualmente">
          @if (!manualExpanded()) {
            <button
              type="button"
              class="sf-button sf-text sf-full"
              [disabled]="disabled()"
              (click)="manualExpanded.set(true)"
            >
              Adicionar “{{ query().trim() }}” manualmente
            </button>
          } @else {
            <strong>{{ query().trim() }}</strong>
            <label
              >Artista (opcional)<input
                pInputText
                maxlength="160"
                [value]="manualArtist()"
                [readOnly]="disabled()"
                (input)="manualArtist.set($any($event.target).value)"
            /></label>
            <button
              type="button"
              class="sf-button sf-primary sf-full"
              [disabled]="
                disabled() || isAdded({ title: query().trim(), artist: manualArtist().trim() })
              "
              (click)="chooseManual()"
            >
              Adicionar música
            </button>
          }
        </section>
      }
    </ng-template>
    @if (scrollResults()) {
      <p-scrollarea variant="scroll" class="picker-scrollarea">
        <p-scrollarea-viewport class="picker-results" role="region" aria-label="Lista de músicas">
          <p-scrollarea-content class="picker-content"
            ><ng-container [ngTemplateOutlet]="resultsContent"
          /></p-scrollarea-content>
        </p-scrollarea-viewport>
        <p-scrollarea-scrollbar orientation="vertical"
          ><p-scrollarea-handle
        /></p-scrollarea-scrollbar>
      </p-scrollarea>
    } @else {
      <div class="picker-results"><ng-container [ngTemplateOutlet]="resultsContent" /></div>
    }
    @if (!inlineManual()) {
      <button
        type="button"
        class="sf-button sf-text sf-full"
        [disabled]="disabled()"
        (click)="manual.emit()"
      >
        Não encontrei minha música
      </button>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .picker-results {
      display: contents;
    }
    :host.picker-scroll-results {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    :host.picker-scroll-results .picker-search,
    :host.picker-scroll-results .picker-hint,
    :host.picker-scroll-results > button {
      flex: none;
    }
    :host.picker-scroll-results .picker-results {
      display: block;
      flex: 1;
      min-height: 0;
      overscroll-behavior: contain;
      padding: 0;
      overflow-x: hidden !important;
    }
    .picker-scrollarea {
      flex: 1;
      min-height: 0;
      height: 100%;
      width: 100%;
      border: 0;
      border-radius: 0;
      background: transparent;
    }
    .picker-content {
      min-width: 0 !important;
      width: 100%;
      padding: 0 8px 4px 2px;
    }
    :host.picker-scroll-results .picker-list {
      margin-top: 0;
    }
    .picker-manual {
      margin: 16px 0;
      padding: 12px;
      border: 1px solid var(--sf-border);
      border-radius: 12px;
      background: #fff;
      overflow-wrap: anywhere;
    }
    .picker-manual label {
      display: grid;
      gap: 8px;
      margin: 12px 0;
    }
    .picker-manual input {
      width: 100%;
    }
    .picker-search {
      display: grid;
      gap: 8px;
    }
    .picker-search input {
      width: 100%;
    }
    .picker-hint {
      margin: 8px 0 0;
      font-size: 13px;
      color: var(--sf-muted);
    }
    .picker-list {
      list-style: none;
      padding: 0;
      margin: 16px 0;
      display: grid;
      gap: 12px;
    }
    .picker-list li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 16px 12px;
      background: #fff;
      border: 1px solid var(--sf-border);
      border-radius: 12px;
      box-shadow: 0 2px 5px rgb(11 30 63 / 4%);
    }
    .picker-list strong,
    .picker-list span,
    .picker-list small {
      display: block;
      overflow-wrap: anywhere;
    }
    .picker-list small {
      color: var(--sf-purple);
      font-size: 12px;
      margin-top: 4px;
    }
    .picker-list button {
      padding: 10px;
      font-size: 13px;
    }
    .picker-list .picker-add {
      width: 48px;
      height: 48px;
      padding: 0;
      flex-shrink: 0;
    }
    .picker-list .picker-add .pi {
      font-size: 18px;
    }
    .picker-list li.picker-already-added {
      background: #f0eaff;
      border-color: #d8c7fa;
      box-shadow: none;
    }
    .picker-list .picker-added-check {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      color: var(--sf-purple);
    }
    .picker-added-check .pi {
      font-size: 22px;
    }
    .picker-list button span {
      display: inline;
    }
    .picker-pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
  `,
})
export class CatalogSongPicker implements OnInit, OnDestroy {
  readonly scrollResults = input(false);
  readonly externalSearch = input(false);
  readonly incremental = input(false);
  readonly inlineManual = input(false);
  readonly searchField = viewChild<TemplateRef<unknown>>('searchField');
  readonly manualExpanded = signal(false);
  readonly manualArtist = signal('');
  readonly hasMore = signal(false);
  private nextSource = 'catalog';
  private nextPage = 0;
  chooseManual() {
    this.choose({ title: this.query().trim(), artist: this.manualArtist().trim() });
  }
  loadMore() {
    if (this.loading() || this.disabled() || !this.hasMore()) return;
    if (this.query().trim()) void this.lookupPage(this.query().trim(), true);
    else void this.browse(this.page() + 1, true);
  }
  private appendUnique(incoming: PickedSong[], append: boolean) {
    const unique = new Map<string, PickedSong>();
    for (const song of [...(append ? this.songs() : []), ...incoming]) {
      const key = this.songKey(song);
      if (!unique.has(key)) unique.set(key, song);
    }
    this.songs.set([...unique.values()]);
  }
  readonly disabled = input(false);
  readonly actionIcon = input('pi-plus');
  readonly actionLabel = input('Adicionar');
  readonly addedSongs = input<ReadonlyArray<{ title: string; artist: string | null }>>([]);
  private songKey(song: { title: string; artist: string | null }) {
    const normalize = (value: string | null) =>
      (value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
    return JSON.stringify([normalize(song.title), normalize(song.artist)]);
  }
  isAdded(song: PickedSong) {
    return this.addedSongs().some((added) => this.songKey(added) === this.songKey(song));
  }
  choose(song: PickedSong) {
    if (!this.disabled() && !this.loading() && !this.isAdded(song)) this.picked.emit(song);
  }
  readonly picked = output<PickedSong>();
  readonly manual = output<void>();
  private readonly api = inject(ApiClient);
  readonly query = signal('');
  readonly songs = signal<PickedSong[]>([]);
  readonly loading = signal(false);
  readonly message = signal('Escolha uma música do catálogo.');
  readonly total = signal(0);
  readonly page = signal(0);
  private generation = 0;
  private destroyed = false;
  private timer?: ReturnType<typeof setTimeout>;
  ngOnInit() {
    void this.browse(0);
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.generation++;
    clearTimeout(this.timer);
  }
  search(value: string) {
    clearTimeout(this.timer);
    this.generation++;
    this.query.set(value);
    this.hasMore.set(false);
    this.nextSource = 'catalog';
    this.nextPage = 0;
    this.manualExpanded.set(false);
    this.manualArtist.set('');
    this.songs.set([]);
    this.loading.set(false);
    const text = value.trim();
    if (!text) {
      void this.browse(0);
      return;
    }
    if (text.length < 3) {
      this.message.set('Digite pelo menos 3 caracteres para buscar.');
      return;
    }
    this.timer = setTimeout(() => void this.lookup(text), 400);
  }
  async browse(page: number, append = false) {
    const generation = ++this.generation;
    this.loading.set(true);
    try {
      const result = await this.api.get<{ items: PickedSong[]; total: number }>(
        `/public/songs/catalog?page=${page}${this.incremental() ? '&size=10' : ''}`,
      );
      if (this.destroyed || generation !== this.generation) return;
      if (!Array.isArray(result.items)) throw new Error('Unavailable');
      this.appendUnique(
        result.items.map((s) => ({ ...s, source: 'SINGFLOW' })),
        append,
      );
      this.hasMore.set((page + 1) * (this.incremental() ? 10 : 20) < result.total);
      this.total.set(result.total);
      this.page.set(page);
      this.message.set(
        result.total
          ? 'Escolha uma música ou busque no catálogo e na internet.'
          : 'Busque uma música na internet ou informe o título manualmente.',
      );
    } catch {
      if (!this.destroyed && generation === this.generation)
        this.message.set(
          'Não foi possível carregar o catálogo. Você pode buscar ou informar a música manualmente.',
        );
    } finally {
      if (!this.destroyed && generation === this.generation) this.loading.set(false);
    }
  }
  private async lookupPage(query: string, append = false) {
    const generation = ++this.generation;
    this.loading.set(true);
    try {
      const result = await this.api.get<{
        items: PickedSong[];
        hasMore: boolean;
        nextSource: string;
        nextPage: number;
      }>(
        `/public/songs/search-page?q=${encodeURIComponent(query)}&source=${this.nextSource}&page=${this.nextPage}`,
      );
      if (this.destroyed || generation !== this.generation) return;
      if (
        !Array.isArray(result.items) ||
        typeof result.hasMore !== 'boolean' ||
        !['catalog', 'internet'].includes(result.nextSource) ||
        !Number.isInteger(result.nextPage)
      )
        throw new Error('Unavailable');
      this.appendUnique(result.items.slice(0, 10), append);
      this.hasMore.set(result.hasMore);
      this.nextSource = result.nextSource;
      this.nextPage = result.nextPage;
      this.message.set(
        this.songs().length
          ? 'Escolha uma música ou carregue mais resultados.'
          : 'Nenhuma música encontrada. Você pode adicionar o título digitado.',
      );
    } catch {
      if (!this.destroyed && generation === this.generation)
        this.message.set(
          append
            ? 'Não foi possível carregar mais. Tente novamente; suas músicas continuam na lista.'
            : 'Busca indisponível. Você pode adicionar o título digitado.',
        );
    } finally {
      if (!this.destroyed && generation === this.generation) this.loading.set(false);
    }
  }
  private async lookup(query: string) {
    if (this.incremental()) return this.lookupPage(query);

    const generation = ++this.generation;
    this.loading.set(true);
    try {
      const songs = await this.api.get<PickedSong[]>(
        `/public/songs/search?q=${encodeURIComponent(query)}`,
      );
      if (this.destroyed || generation !== this.generation) return;
      if (!Array.isArray(songs)) throw new Error('Unavailable');
      this.songs.set(songs.slice(0, 10));
      this.message.set(
        songs.length
          ? 'Resultados do catálogo e da internet. Adicione e continue escolhendo.'
          : 'Nenhuma música encontrada. Você pode informar o título manualmente.',
      );
    } catch {
      if (!this.destroyed && generation === this.generation)
        this.message.set('Busca indisponível. Você pode informar a música manualmente.');
    } finally {
      if (!this.destroyed && generation === this.generation) this.loading.set(false);
    }
  }
}
