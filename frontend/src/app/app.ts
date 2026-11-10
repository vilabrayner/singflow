import { afterRenderEffect, Component, computed, ElementRef, inject } from '@angular/core';
import { ToastModule } from 'primeng/toast';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastModule],
  templateUrl: './app.html',
})
export class App {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly router = inject(Router);
  private readonly routePath = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split(/[?#]/)[0]),
    ),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );
  readonly hostPanel = computed(() => this.routePath() === '/anfitriao');
  readonly participantPanel = computed(() =>
    /^\/participante\/[^/]+\/[^/]+$/.test(this.routePath()),
  );
  readonly compactPanel = computed(() => this.hostPanel() || this.participantPanel());

  constructor() {
    afterRenderEffect((onCleanup) => {
      this.routePath();
      const header = this.element.querySelector<HTMLElement>('.sf-panel-header, .site-header');
      if (!header) return;

      const updateOffset = () => {
        this.element.style.setProperty('--sf-header-height', `${header.offsetHeight}px`);
      };

      updateOffset();
      const observer = new ResizeObserver(updateOffset);
      observer.observe(header, { box: 'border-box' });
      onCleanup(() => observer.disconnect());
    });
  }
}
