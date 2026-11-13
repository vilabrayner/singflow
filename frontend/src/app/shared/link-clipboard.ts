import { DOCUMENT } from '@angular/common';
import { Clipboard } from '@angular/cdk/clipboard';
import { Injectable, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LinkClipboard {
  private readonly document = inject(DOCUMENT);
  private readonly fallback = inject(Clipboard);
  async copy(value: string): Promise<boolean> {
    if (!value) return false;
    const clipboard = this.document.defaultView?.navigator.clipboard;
    if (clipboard?.writeText) {
      try {
        await clipboard.writeText(value);
        return true;
      } catch {
        // Some browsers deny access even when the modern API is present.
      }
    }
    return this.fallback.copy(value);
  }
}
