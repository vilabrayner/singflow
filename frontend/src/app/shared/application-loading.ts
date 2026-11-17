import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ApplicationLoading {
  private readonly active = signal(0);
  readonly pending = computed(() => this.active() > 0);
  readonly visible = signal(false);
  private shownAt = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }
  start(): () => void {
    clearTimeout(this.timer);
    if (!this.visible()) {
      this.shownAt = Date.now();
      this.visible.set(true);
    }
    this.active.update((n) => n + 1);
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.active.update((n) => Math.max(0, n - 1));
      if (!this.pending())
        this.timer = setTimeout(
          () => {
            if (!this.pending()) this.visible.set(false);
          },
          Math.max(0, 300 - (Date.now() - this.shownAt)),
        );
    };
  }
  async track<T>(request: () => Promise<T>, background = false): Promise<T> {
    if (background) return request();
    const finish = this.start();
    try {
      return await request();
    } finally {
      finish();
    }
  }
}
