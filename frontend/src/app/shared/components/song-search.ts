import { InputInteraction } from '../input-interaction';
import { Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { FormControl, FormsModule } from '@angular/forms';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ApiClient } from '../../core/http/api-client';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

interface Song {
  title: string;
  artist: string;
  label: string;
  id?: string | null;
  source?: string;
  selectionToken?: string | null;
}
let nextId = 0;

@Component({
  selector: 'app-song-search',
  imports: [FormsModule, AutoCompleteModule],
  template: `
    <label [for]="id">{{ label() }}</label>
    <p-autocomplete
      (keydown.escape)="$event.stopPropagation()"
      [inputId]="id"
      [ngModel]="value()"
      (ngModelChange)="change($event)"
      [ngModelOptions]="{ standalone: true }"
      [suggestions]="suggestions()"
      (completeMethod)="search($event.query)"
      optionLabel="label"
      [minQueryLength]="3"
      [delay]="400"
      [forceSelection]="false"
      [autoHighlight]="false"
      [autoOptionFocus]="false"
      [selectOnFocus]="false"
      [focusOnHover]="!interaction.touchPrimary()"
      [readonly]="locked()"
      [maxlength]="160"
      [fluid]="true"
      [showEmptyMessage]="true"
      emptyMessage="Nenhuma música encontrada. Use o texto digitado."
      [pt]="{ pcInputText: { root: { 'aria-describedby': id + '-help' } } }"
    >
      <ng-template #item let-song>
        <div>
          <span>{{ song.label }}</span>
          @if (song.source) {
            <small class="song-origin">{{
              song.source === 'SINGFLOW' ? 'SingFlow' : 'Last.fm'
            }}</small>
          }
        </div>
      </ng-template>
    </p-autocomplete>
    <small [id]="id + '-help'" aria-live="polite">{{ message() }}</small>
  `,
  styles: [
    `
      :host {
        display: grid;
        gap: 0.5rem;
        min-width: 0;
      }
      label {
        font-weight: 700;
      }
      .song-origin {
        display: block;
        font-size: 0.75rem;
      }
      small {
        color: var(--sf-muted, #52627c);
      }
    `,
  ],
})
export class SongSearch implements OnInit {
  readonly interaction = inject(InputInteraction);
  readonly titleControl = input.required<FormControl<string>>();
  readonly artistControl = input.required<FormControl<string>>();
  readonly selectionControl = input<FormControl<string>>();
  readonly label = input('Música');
  readonly locked = input(false);
  readonly id = `song-search-${++nextId}`;
  readonly value = signal<string | Song>('');
  readonly suggestions = signal<Song[]>([]);
  readonly message = signal(
    'Digite 3 caracteres para buscar ou informe uma música em texto livre.',
  );
  private readonly api = inject(ApiClient);
  private readonly destroy = inject(DestroyRef);
  private revision = 0;

  constructor() {
    this.destroy.onDestroy(() => this.revision++);
  }

  ngOnInit() {
    this.value.set(this.titleControl().value);
    this.titleControl()
      .valueChanges.pipe(takeUntilDestroyed(this.destroy))
      .subscribe((title) => {
        const current = this.value();
        if ((typeof current === 'string' ? current : current.title) !== title) {
          this.revision++;
          this.value.set(title);
          this.selectionControl()?.setValue('');
          this.suggestions.set([]);
        }
      });
  }

  change(value: string | Song | null) {
    this.revision++;
    this.value.set(value ?? '');
    this.suggestions.set([]);
    this.titleControl().setValue(typeof value === 'string' ? value : (value?.title ?? ''));
    this.artistControl().setValue(typeof value === 'object' && value ? value.artist : '');
    this.selectionControl()?.setValue(
      typeof value === 'object' && value ? (value.selectionToken ?? '') : '',
    );
    this.titleControl().markAsDirty();
    this.artistControl().markAsDirty();
  }

  async search(query: string) {
    const revision = ++this.revision;
    const text = query.trim();
    if (text.length < 3 || this.locked()) {
      this.suggestions.set([]);
      return;
    }
    this.message.set('Buscando músicas…');
    try {
      const songs = await this.api.get<
        {
          title: string;
          artist: string;
          id?: string | null;
          selectionToken?: string | null;
          source?: string;
        }[]
      >(`/public/songs/search?q=${encodeURIComponent(text)}`);
      if (revision !== this.revision) return;
      this.suggestions.set(
        songs.slice(0, 10).map((song) => ({
          ...song,
          label: song.artist ? `${song.title} — ${song.artist}` : song.title,
        })),
      );
      this.message.set(
        songs.length
          ? 'Selecione uma sugestão ou mantenha o texto livre. SingFlow e Last.fm.'
          : 'Nenhuma música encontrada. Você pode usar o texto digitado.',
      );
    } catch {
      if (revision !== this.revision) return;
      this.suggestions.set([]);
      this.message.set('Busca indisponível. Você pode usar a música digitada em texto livre.');
    }
  }
}
