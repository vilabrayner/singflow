import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Touch does not request a software keyboard merely because a form was opened. */
@Injectable({ providedIn: 'root' })
export class InputInteraction {
  private readonly document = inject(DOCUMENT);
  private readonly destroy = inject(DestroyRef);
  readonly touchPrimary = signal(false);
  private keyboardNavigation = false;
  constructor() {
    const media = this.document.defaultView?.matchMedia('(hover: none) and (pointer: coarse)');
    const update = () => this.touchPrimary.set(media?.matches ?? false);
    update();
    media?.addEventListener('change', update);
    const key = (event: KeyboardEvent) => {
      if (['Tab', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key))
        this.keyboardNavigation = true;
    };
    const pointer = (event: PointerEvent) => {
      this.keyboardNavigation = event.pointerType === 'mouse';
    };
    this.document.addEventListener('keydown', key, true);
    this.document.addEventListener('pointerdown', pointer, true);
    this.destroy.onDestroy(() => {
      media?.removeEventListener('change', update);
      this.document.removeEventListener('keydown', key, true);
      this.document.removeEventListener('pointerdown', pointer, true);
    });
  }
  focus(element: HTMLElement | null | undefined) {
    if (!element) return;
    if (
      this.touchPrimary() &&
      !this.keyboardNavigation &&
      element.matches('input,textarea,[contenteditable="true"]')
    )
      return;
    element.focus({ preventScroll: this.touchPrimary() });
  }
}
