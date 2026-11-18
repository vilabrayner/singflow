import { DOCUMENT } from '@angular/common';
import { afterNextRender, DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';

/** Pull-to-refresh belongs to the main viewport, never nested lists, inputs or drag handles. */
@Directive({ selector: '[appPullRefresh]' })
export class PullRefresh {
  readonly refresh = input<(() => Promise<unknown>) | null>(null, { alias: 'appPullRefresh' });
  readonly disabled = input(false, { alias: 'pullRefreshDisabled' });
  private readonly element: HTMLElement = inject(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly destroy = inject(DestroyRef);
  private indicator?: HTMLElement;
  private icon?: HTMLElement;
  private label?: HTMLElement;
  private startX = 0;
  private startY = 0;
  private distance = 0;
  private tracking = false;
  private running = false;
  private content?: HTMLElement;
  private firstCard?: HTMLElement;
  private frame?: number;
  private settling?: ReturnType<typeof setTimeout>;
  private anchorTop = 0;
  private anchorLeft = 0;
  private disposed = false;
  constructor() {
    afterNextRender(() => {
      const indicator = this.document.createElement('div');
      indicator.className = 'sf-pull-refresh';
      indicator.hidden = true;
      indicator.setAttribute('role', 'status');
      indicator.setAttribute('aria-live', 'polite');
      this.icon = this.document.createElement('i');
      this.icon.className = 'fa-solid fa-rotate-right';
      this.icon.setAttribute('aria-hidden', 'true');
      this.label = this.document.createElement('span');
      indicator.append(this.icon, this.label);
      this.document.body.append(indicator);
      this.indicator = indicator;
      const start = (event: TouchEvent) => this.start(event);
      const move = (event: TouchEvent) => this.move(event);
      const end = () => void this.end();
      const cancel = () => this.reset();
      this.element.addEventListener('touchstart', start, { passive: true });
      this.element.addEventListener('touchmove', move, { passive: false });
      this.element.addEventListener('touchend', end, { passive: true });
      this.element.addEventListener('touchcancel', cancel, { passive: true });
      this.destroy.onDestroy(() => {
        this.disposed = true;
        this.releaseContent();
        indicator.remove();
        this.element.removeEventListener('touchstart', start);
        this.element.removeEventListener('touchmove', move);
        this.element.removeEventListener('touchend', end);
        this.element.removeEventListener('touchcancel', cancel);
      });
    });
  }
  private start(event: TouchEvent) {
    if (this.running) return;
    this.releaseContent();
    this.tracking = false;
    this.distance = 0;
    if (this.indicator) this.indicator.hidden = true;
    const target = event.target as HTMLElement;
    if (
      !this.refresh() ||
      this.disabled() ||
      this.element.scrollTop > 1 ||
      event.touches.length !== 1
    )
      return;
    if (
      target.closest(
        'input, textarea, select, button, a, summary, [contenteditable], .cdk-drag, [role="dialog"]',
      )
    )
      return;
    if (target.closest('p-scrollarea-viewport') !== this.element) return;
    const card = Array.from(
      this.element.querySelectorAll<HTMLElement>('app-surface-card > .sf-card'),
    ).find(
      (candidate) =>
        candidate.getClientRects().length > 0 &&
        candidate.closest('p-scrollarea-viewport') === this.element,
    );
    const content = this.element.querySelector<HTMLElement>('p-scrollarea-content');
    if (!card || !card.contains(target) || !content) return;
    const active = this.document.activeElement;
    if (active?.matches('input, textarea, select, [contenteditable]')) return;
    this.firstCard = card;
    this.content = content;
    const rect = card.getBoundingClientRect();
    this.anchorTop = rect.top;
    this.anchorLeft = rect.left + rect.width / 2;
    this.startX = event.touches[0].clientX;
    this.startY = event.touches[0].clientY;
    this.tracking = true;
  }
  private move(event: TouchEvent) {
    if (!this.tracking) return;
    if (
      event.touches.length !== 1 ||
      this.disabled() ||
      this.element.scrollTop > 1 ||
      !this.firstCard?.getClientRects().length
    ) {
      this.reset();
      return;
    }
    const dy = event.touches[0].clientY - this.startY;
    const dx = Math.abs(event.touches[0].clientX - this.startX);
    if (dy < -5 || dx > Math.max(12, dy)) {
      this.reset();
      return;
    }
    if (dy < 4) return;
    // Claim the first downward move, including fast gestures, before native overscroll.
    if (!event.cancelable) {
      this.reset();
      return;
    }
    event.preventDefault();
    // Position-based resistance makes quick and slow pulls travel the same distance.
    this.distance = 108 * (1 - Math.exp(-dy / 160));
    if (this.frame === undefined) {
      this.frame = this.document.defaultView?.requestAnimationFrame(() => {
        this.frame = undefined;
        this.paint();
      });
    }
  }
  private paint() {
    if (!this.content || !this.indicator || !this.icon || !this.label) return;
    this.content.classList.add('sf-pull-content');
    this.content.style.setProperty('--sf-pull-distance', `${this.distance}px`);
    this.indicator.hidden = false;
    this.indicator.style.top = `${this.anchorTop + Math.max(0, (this.distance - 40) / 2)}px`;
    this.indicator.style.left = `${this.anchorLeft}px`;
    this.indicator.style.opacity = String(Math.min(1, this.distance / 40));
    this.indicator.style.clipPath =
      this.distance < 40 ? `inset(0 0 ${40 - this.distance}px 0)` : 'none';
    this.icon.style.transform = `rotate(${this.distance * 3}deg)`;
    this.label.textContent = this.distance >= 64 ? 'Solte para atualizar' : 'Puxe para atualizar';
  }
  private async end() {
    const refresh = this.refresh();
    if (!this.tracking || this.distance < 64 || this.disabled() || !refresh) {
      this.reset();
      return;
    }
    this.tracking = false;
    this.running = true;
    this.cancelFrame();
    this.distance = 76;
    this.content?.classList.add('sf-pull-settling');
    this.paint();
    const started = Date.now();
    if (this.label) this.label.textContent = 'Atualizando…';
    this.icon?.classList.add('fa-spin');
    try {
      await refresh();
    } catch {
      /* The panel owns its request errors. */
    } finally {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, 300 - (Date.now() - started))),
      );
      this.running = false;
      if (!this.disposed) this.reset();
    }
  }
  private cancelFrame() {
    if (this.frame !== undefined) this.document.defaultView?.cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }
  private releaseContent() {
    this.cancelFrame();
    clearTimeout(this.settling);
    this.settling = undefined;
    this.content?.classList.remove('sf-pull-content', 'sf-pull-settling');
    this.content?.style.removeProperty('--sf-pull-distance');
    this.content = undefined;
    this.firstCard = undefined;
  }
  private reset() {
    if (this.running) return;
    this.cancelFrame();
    this.tracking = false;
    this.distance = 0;
    this.content?.classList.add('sf-pull-settling');
    this.content?.style.setProperty('--sf-pull-distance', '0px');
    if (this.indicator) this.indicator.hidden = true;
    this.icon?.classList.remove('fa-spin');
    // Remove the temporary translation/containing block once the return finishes.
    clearTimeout(this.settling);
    this.settling = setTimeout(() => this.releaseContent(), 240);
  }
}
