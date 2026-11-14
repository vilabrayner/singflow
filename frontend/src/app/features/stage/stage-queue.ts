import { Component, computed, effect, input, signal } from '@angular/core';
import { InputTextModule } from 'primeng/inputtext';
import { Suggestion } from './stage-api';
@Component({
  selector: 'app-stage-queue',
  imports: [InputTextModule],
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
              {{ row.person.title || 'Música a escolher' }}
              @if (row.person.artist) {
                <br />{{ row.person.artist }}
              }
            </p>
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
