import { Component, input } from '@angular/core';

@Component({
  selector: 'app-surface-card',
  host: { class: 'sf-surface' },
  template: `<section
    class="sf-card"
    [attr.aria-labelledby]="labelledBy()"
    [attr.aria-label]="label()"
  >
    <ng-content />
  </section>`,
})
export class SurfaceCard {
  readonly labelledBy = input<string>();
  readonly label = input<string>();
}
