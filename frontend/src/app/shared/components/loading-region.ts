import { DOCUMENT } from '@angular/common';
import { Component, OnDestroy, ViewEncapsulation, inject } from '@angular/core';
import { BlockUIModule } from 'primeng/blockui';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ApplicationLoading } from '../application-loading';

/** One document overlay; never wraps or changes the geometry of feature content. */
@Component({
  selector: 'app-loading-region',
  host: { '[attr.aria-busy]': 'state.visible()' },
  imports: [BlockUIModule, ProgressSpinnerModule],
  encapsulation: ViewEncapsulation.None,
  styles: `
    app-loading-region {
      display: contents;
    }
    .sf-application-loading {
      justify-content: center;
      align-items: center;
      background: var(--p-mask-background, rgb(0 0 0 / 40%));
    }
    .sf-application-loading .sf-application-spinner {
      width: 44px;
      height: 44px;
      color: var(--sf-purple);
      --p-progressspinner-color-one: var(--sf-purple);
      --p-progressspinner-color-two: var(--sf-purple);
      --p-progressspinner-color-three: var(--sf-purple);
      --p-progressspinner-color-four: var(--sf-purple);
    }
  `,
  template: `<p-blockui
    [blocked]="state.visible()"
    [baseZIndex]="10000"
    class="sf-application-loading"
  >
    @if (state.visible()) {
      <p-progress-spinner class="sf-application-spinner" ariaLabel="Carregando dados" />
    }
  </p-blockui>`,
})
export class LoadingRegion implements OnDestroy {
  readonly state = inject(ApplicationLoading);
  private readonly document = inject(DOCUMENT);
  private readonly pendingKey = (event: KeyboardEvent) => {
    if (this.state.pending() && event.key !== 'Tab' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  constructor() {
    this.document.addEventListener('keydown', this.pendingKey, true);
  }
  ngOnDestroy() {
    this.document.removeEventListener('keydown', this.pendingKey, true);
  }
}
