import { Component } from '@angular/core';
import { MusicianPage } from '../../features/musicians/musician.page';

@Component({
  imports: [MusicianPage],
  template: '<app-musician-page />',
  styles: ':host { display: block; background: var(--sf-canvas); }',
})
export class MusicianLayout {}
