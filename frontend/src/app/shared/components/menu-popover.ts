import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  ConnectedPosition,
  Overlay,
} from '@angular/cdk/overlay';
import { Component, inject, input, model } from '@angular/core';

@Component({
  selector: 'app-menu-popover',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, CdkTrapFocus],
  template: `
    <button
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      type="button"
      class="sf-icon-button sf-menu-trigger"
      [id]="buttonId()"
      [attr.aria-label]="label()"
      [title]="label()"
      aria-haspopup="menu"
      [attr.aria-controls]="buttonId() + '-menu'"
      [attr.aria-expanded]="opened()"
      [disabled]="disabled()"
      (click)="toggle($event)"
    >
      <i [class]="icon()" aria-hidden="true"></i>
    </button>
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="opened()"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="sf-menu-backdrop"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayViewportMargin]="16"
      [cdkConnectedOverlayScrollStrategy]="scrollStrategy"
      (backdropClick)="close()"
      (overlayKeydown)="keydown($event)"
    >
      <div cdkTrapFocus [cdkTrapFocusAutoCapture]="true" [id]="buttonId() + '-menu'">
        <ng-content />
      </div>
    </ng-template>
  `,
})
export class MenuPopover {
  readonly buttonId = input.required<string>();
  readonly label = input.required<string>();
  readonly disabled = input(false);
  readonly icon = input('pi pi-bars');
  readonly opened = model(false);
  readonly scrollStrategy = inject(Overlay).scrollStrategies.block();
  readonly positions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
  ];

  toggle(event: Event) {
    // Touch browsers may leave focus on an unrelated control at the top of the page.
    // Capture this trigger before the trap saves the element to restore on close.
    (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    this.opened.update((open) => !open);
  }

  close() {
    this.opened.set(false);
  }

  keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }
}
