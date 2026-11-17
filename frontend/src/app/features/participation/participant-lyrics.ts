import {
  Component,
  effect,
  inject,
  input,
  OnDestroy,
  signal,
  untracked,
  computed,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiClient } from '../../core/http/api-client';
interface LyricsResult {
  status: string;
  provider: string;
  title: string;
  artist: string;
  text: string | null;
  sourceUrl: string | null;
}
@Component({
  selector: 'app-participant-lyrics',
  styles: `
    :host {
      display: block;
      margin-top: 24px;
    }
    .lyrics-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .lyrics-heading h3 {
      margin: 0;
    }
    .lyrics-text {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      text-align: left;
      font: inherit;
      font-size: 20px;
      line-height: 1.8;
      margin: 20px 0;
      color: var(--sf-navy, #0b1e3f);
    }
    .lyrics-source {
      font-size: 13px;
      color: var(--sf-muted);
    }
    .lyrics-message {
      text-align: left;
    }
  `,
  template: `<section aria-labelledby="participant-lyrics-title">
    <div class="lyrics-heading"><h3 id="participant-lyrics-title">Letra da música</h3></div>
    @if (loading()) {}
    @if (error()) {
      <p class="sf-dialog-error" role="alert">{{ error() }}</p>
      <button type="button" class="sf-button sf-outline sf-full" (click)="retry()">
        Tentar carregar novamente
      </button>
    }
    @if (result(); as lyrics) {
      @if (lyrics.status === 'FOUND') {
        <pre class="lyrics-text">{{ lyrics.text }}</pre>
        @if (source(); as url) {
          <p class="lyrics-source">
            Fonte:
            <a [href]="url" target="_blank" rel="noopener noreferrer"
              >LRCLIB <i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i
            ></a>
          </p>
        }
      } @else {
        <p class="lyrics-message" role="status">
          {{
            lyrics.status === 'MISSING_ARTIST'
              ? 'Precisamos do artista cadastrado para encontrar a letra.'
              : lyrics.status === 'INSTRUMENTAL'
                ? 'Esta versão está identificada como instrumental.'
                : 'Não encontramos a letra desta música.'
          }}
        </p>
        @if (lyrics.status === 'NOT_FOUND') {
          <button type="button" class="sf-button sf-outline sf-full" (click)="retry()">
            Tentar carregar novamente
          </button>
        }
      }
    }
  </section>`,
})
export class ParticipantLyrics implements OnDestroy {
  readonly session = input.required<string>();
  readonly callId = input.required<string>();
  readonly title = input<string | null>(null);
  readonly artist = input<string | null>(null);
  private readonly api = inject(ApiClient);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly result = signal<LyricsResult | null>(null);
  private generation = 0;
  private lookupAbort?: AbortController;
  private destroyed = false;
  readonly source = computed(() => {
    const value = this.result()?.sourceUrl;
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' &&
        url.hostname === 'lrclib.net' &&
        !url.username &&
        !url.password &&
        !url.port &&
        /^\/tracks\/\d+$/.test(url.pathname)
        ? url.href
        : null;
    } catch {
      return null;
    }
  });
  constructor() {
    effect(() => {
      const session = this.session(),
        call = this.callId();
      this.title();
      this.artist();
      untracked(() => void this.load(session, call));
    });
  }
  retry() {
    if (!this.loading()) void this.load(this.session(), this.callId());
  }
  private async load(session: string, call: string) {
    this.lookupAbort?.abort();
    const lookupAbort = (this.lookupAbort = new AbortController());
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    this.result.set(null);
    try {
      const result = await this.api.get<LyricsResult>(
        `/participation/${session}/calls/${call}/lyrics`,
        { signal: lookupAbort.signal },
      );
      if (!this.destroyed && generation === this.generation) this.result.set(result);
    } catch (e) {
      if (!this.destroyed && generation === this.generation)
        this.error.set(
          e instanceof HttpErrorResponse && e.error?.detail
            ? e.error.detail
            : 'Não foi possível carregar a letra agora. Tente novamente em instantes.',
        );
    } finally {
      if (!this.destroyed && generation === this.generation) this.loading.set(false);
    }
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.lookupAbort?.abort();
    this.generation++;
  }
}
