import { Component, input } from '@angular/core';

@Component({
  selector: 'app-surface-card',
  host: { class: 'sf-surface' },
  template: `<section class="sf-card" [attr.aria-labelledby]="labelledBy()">
    <ng-content />
  </section>`,
})
export class SurfaceCard {
  readonly labelledBy = input<string>();
}
