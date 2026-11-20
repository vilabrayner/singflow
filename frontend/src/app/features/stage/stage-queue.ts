import { StreamingLink } from '../../shared/streaming';
import { Component, computed, effect, input, signal } from '@angular/core';
import { ChordActions } from '../../shared/components/chord-actions';
import { ChordLink, ChordSong } from '../../shared/components/chord-link-dialog';
import { output } from '@angular/core';
import { InputTextModule } from 'primeng/inputtext';
import { Suggestion } from './stage-api';
@Component({
  selector: 'app-stage-queue',
  imports: [InputTextModule, ChordActions],
  styleUrls: ['../../shared/styles/song-panels.css', '../../shared/styles/history-items.css'],
  styles: `
    :host {
      display: block;
    }
    ol {
      display: grid;
      gap: 12px;
      list-style: none;
      padding: 0;
      margin: 16px 0 0;
    }
    .queue-search {
      display: grid;
      gap: 8px;
      font-size: 14px;
      font-weight: 750;
    }
    input {
      width: 100%;
      min-width: 0;
    }
    .choice-copy strong {
      padding-top: 0;
    }
    .choice-copy small {
      color: var(--sf-muted);
      font-size: 13px;
    }
  `,
  template: `
    @if (searchable()) {
      <label class="queue-search"
        >Buscar na fila<input
          pInputText
          type="search"
          placeholder="Nome, música ou artista"
          [value]="search()"
          (input)="search.set($any($event.target).value)"
      /></label>
    }
    <ol aria-label="Fila de participantes">
      @for (row of rows(); track row.person.participantId) {
        <li class="choice-panel history-numbered sf-queue-line">
          <span class="history-order" [attr.aria-label]="'Posição ' + row.position">{{
            row.position
          }}</span>
          <div class="choice-copy">
            <strong>{{ row.person.name }}</strong>
            <p>
              @if (catalogEditable() && row.person.catalogSongId) {
                <button
                  type="button"
                  class="sf-button sf-text"
                  [attr.aria-label]="'Editar música ' + row.person.title"
                  (click)="songEdited.emit(row.person.catalogSongId!)"
                >
                  {{ row.person.title || 'Música a escolher' }}
                </button>
              } @else {
                {{ row.person.title || 'Música a escolher' }}
              }
              @if (row.person.artist) {
                <br />{{ row.person.artist }}
              }
            </p>
            <p>Tom: {{ row.person.keyLabel || 'Original' }}</p>
            @if (row.person.catalogSongId && chordsEnabled()) {
              <app-chord-actions
                [song]="{
                  id: row.person.catalogSongId!,
                  title: row.person.title ?? 'Música',
                  artist: row.person.artist,
                }"
                [link]="chords()[row.person.catalogSongId!]"
                [streaming]="streaming()[row.person.catalogSongId!] ?? []"
                [originalKey]="row.person.originalKey"
                [semitones]="row.person.semitones"
                [editable]="chordsEditable()"
                (chosen)="chordChosen.emit($event)"
              />
            }
            @if (row.person.tableLabel) {
              <small>Mesa {{ row.person.tableLabel }}</small>
            }
          </div>
        </li>
      } @empty {
        <li>
          {{ search() ? 'Nenhum resultado na fila.' : 'Ainda não há próximas músicas sugeridas.' }}
        </li>
      }
    </ol>
  `,
})
export class StageQueue {
  readonly chordsEnabled = input(false);
  readonly chordsEditable = input(false);
  readonly chords = input<Record<string, ChordLink>>({});
  readonly streaming = input<Record<string, StreamingLink[]>>({});
  readonly chordChosen = output<ChordSong>();
  readonly catalogEditable = input(false);
  readonly songEdited = output<string>();
  readonly suggestions = input.required<Suggestion[]>();
  readonly searchable = input(false);
  readonly search = signal('');
  readonly resetKey = input('');
  constructor() {
    effect(() => {
      this.resetKey();
      this.search.set('');
    });
  }
  readonly rows = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.suggestions()
      .map((person, index) => ({ person, position: index + 1 }))
      .filter(({ person }) =>
        `${person.name} ${person.title ?? ''} ${person.artist ?? ''}`
          .toLocaleLowerCase()
          .includes(query),
      );
  });
}
