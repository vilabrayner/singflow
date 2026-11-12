import { Component, OnInit, OnDestroy, inject, input, output, signal } from '@angular/core';
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
  imports: [InputTextModule],
  template: `
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
                actionLabel() + ' ' + song.title + ' — ' + (song.artist || 'Artista não informado')
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
    @if (!query().trim() && total() > 20) {
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
    <button
      type="button"
      class="sf-button sf-text sf-full"
      [disabled]="disabled()"
      (click)="manual.emit()"
    >
      Não encontrei minha música
    </button>
  `,
  styles: `
    :host {
      display: block;
    }
    .picker-search {
      display: grid;
      gap: 8px;
    }
    .picker-search input {
      width: 100%;
    }
    .picker-hint {
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
  async browse(page: number) {
    const generation = ++this.generation;
    this.loading.set(true);
    try {
      const result = await this.api.get<{ items: PickedSong[]; total: number }>(
        `/public/songs/catalog?page=${page}`,
      );
      if (this.destroyed || generation !== this.generation) return;
      if (!Array.isArray(result.items)) throw new Error('Unavailable');
      this.songs.set(result.items.map((s) => ({ ...s, source: 'SINGFLOW' })));
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
  private async lookup(query: string) {
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
