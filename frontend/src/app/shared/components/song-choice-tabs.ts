import { Component, input, output, signal, viewChild, computed } from '@angular/core';
import { TabsModule } from 'primeng/tabs';
import { InputTextModule } from 'primeng/inputtext';
import { CatalogSongPicker, PickedSong } from './catalog-song-picker';
@Component({
  selector: 'app-song-choice-tabs',
  imports: [TabsModule, InputTextModule, CatalogSongPicker],
  template: `
    <p-tabs
      [value]="activeTab()"
      (valueChange)="activeTab.set($event)"
      class="sf-song-tabs"
      [class.sf-song-tabs-contained]="modern() && (externalSearch() || contained())"
    >
      <p-tablist>
        <p-tab value="catalog" aria-label="Catálogo" title="Catálogo"
          ><i class="fa-solid fa-book" aria-hidden="true"></i
        ></p-tab>
        <p-tab value="favorites" aria-label="Músicas favoritas" title="Músicas favoritas"
          ><i class="fa-regular fa-star" aria-hidden="true"></i
        ></p-tab>
        <p-tab value="most-sung" aria-label="Mais cantadas" title="Mais cantadas"
          ><i class="fa-solid fa-ranking-star" aria-hidden="true"></i
        ></p-tab>
      </p-tablist>
      <p-tabpanels>
        <p-tabpanel value="favorites">
          <h3>Músicas favoritas</h3>
          <div class="song-tab-search">
            <input
              pInputText
              disabled
              aria-label="Buscar nas favoritas"
              placeholder="Digite a música para buscar"
              aria-describedby="favorites-info"
            />
          </div>
          <div class="song-tab-empty" id="favorites-info">
            <p>Favoritas disponíveis após o cadastro de participantes.</p>
          </div>
        </p-tabpanel>
        <p-tabpanel value="most-sung">
          <h3>Músicas mais cantadas</h3>
          <div class="song-tab-search">
            <input
              pInputText
              disabled
              aria-label="Buscar nas mais cantadas"
              placeholder="Digite a música para buscar"
              aria-describedby="most-sung-info"
            />
          </div>
          <div class="song-tab-empty" id="most-sung-info">
            <p>Mais cantadas disponíveis após o cadastro de participantes.</p>
          </div>
        </p-tabpanel>
        <p-tabpanel
          value="catalog"
          [class.sf-modern-catalog-panel]="modern() && (externalSearch() || contained())"
        >
          @if (!modern()) {
            <h3>Catálogo</h3>
          }
          <div
            [class.sf-modern-picker-pane]="modern() && (externalSearch() || contained())"
            [hidden]="manualMode()"
          >
            <app-catalog-song-picker
              [incremental]="modern()"
              [inlineManual]="modern()"
              [scrollResults]="modern() && (externalSearch() || contained())"
              [externalSearch]="externalSearch()"
              [disabled]="disabled()"
              [addedSongs]="addedSongs()"
              [actionIcon]="actionIcon()"
              [actionLabel]="actionLabel()"
              (picked)="picked.emit($event)"
              (manual)="manualMode.set(true); manual.emit()"
            />
          </div>
          <div [hidden]="!manualMode()">
            <button
              type="button"
              class="sf-button sf-text sf-full"
              [disabled]="disabled()"
              (click)="manualMode.set(false)"
            >
              <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>Voltar à busca no catálogo
            </button>
            <ng-content />
          </div>
        </p-tabpanel>
      </p-tabpanels>
    </p-tabs>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    h3 {
      margin: 16px 0;
      font-size: 17px;
    }
    .song-tab-search {
      display: grid;
      gap: 8px;
      font-size: 14px;
      font-weight: 750;
    }
    input {
      width: 100%;
      min-width: 0;
      min-height: 48px;
    }
    .song-tab-empty {
      margin: 16px 0;
      padding: 20px 16px;
      border: 1px solid var(--sf-border);
      border-radius: 12px;
      background: #fff;
      color: var(--sf-muted);
      font-size: 14px;
      line-height: 1.6;
    }
    .song-tab-empty p {
      margin: 0;
    }
    [hidden] {
      display: none !important;
    }
  `,
})
export class SongChoiceTabs {
  readonly contained = input(false);
  readonly modern = input(false);
  readonly externalSearch = input(false);
  private readonly picker = viewChild(CatalogSongPicker);
  readonly searchField = computed(() => this.picker()?.searchField());
  readonly disabled = input(false);
  readonly actionIcon = input('fa-solid fa-plus');
  readonly actionLabel = input('Adicionar');
  readonly addedSongs = input<ReadonlyArray<{ title: string; artist: string | null }>>([]);
  readonly picked = output<PickedSong>();
  readonly manual = output<void>();
  readonly manualMode = signal(false);
  readonly activeTab = signal<string | number | undefined>('catalog');
}
