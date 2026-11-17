import { cifraLink } from '../cifra-link';
import { StreamingActions } from './streaming-actions';
import { StreamingLink } from '../streaming';
import { Component, input, output } from '@angular/core';
import { ChordLink, ChordSong } from './chord-link-dialog';
@Component({
  selector: 'app-chord-actions',
  imports: [StreamingActions],
  styles:
    ':host{display:block;margin-top:8px}.chord-actions{display:flex;gap:8px;align-items:center}',
  template: `<div class="chord-actions">
    @if (url()) {
      <a
        class="sf-icon-button"
        [href]="url()"
        target="_blank"
        rel="noopener noreferrer"
        [attr.aria-label]="'Abrir cifra de ' + song().title"
        title="Abrir cifra"
        ><span class="sf-cifra-icon" aria-hidden="true"></span
        ><i class="fa-solid fa-up-right-from-square sf-external-mark" aria-hidden="true"></i
      ></a>
    }
    <app-streaming-actions [links]="streaming()" [title]="song().title" />
    @if (editable()) {
      <button
        type="button"
        class="sf-icon-button"
        [attr.aria-label]="'Escolher cifra de ' + song().title"
        title="Escolher minha cifra"
        (click)="chosen.emit(song())"
      >
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      </button>
    }
    @if (link()?.alternatives?.length) {
      <small>Revisar preferência</small>
    }
  </div>`,
})
export class ChordActions {
  readonly song = input.required<ChordSong>();
  readonly link = input<ChordLink>();
  readonly editable = input(false);
  readonly streaming = input<StreamingLink[]>([]);
  readonly originalKey = input<string | null>();
  readonly semitones = input<number>();
  readonly chosen = output<ChordSong>();
  url() {
    return cifraLink(this.link()?.effectiveUrl, this.originalKey(), this.semitones());
  }
}
