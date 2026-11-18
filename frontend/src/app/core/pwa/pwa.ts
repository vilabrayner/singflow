import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { version } from '../../../../package.json';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
@Injectable({ providedIn: 'root' })
export class Pwa {
  readonly online = signal(navigator.onLine);
  readonly installed = signal(
    matchMedia('(display-mode: standalone)').matches ||
      !!(navigator as Navigator & { standalone?: boolean }).standalone,
  );
  readonly updateAvailable = signal(false);
  readonly secure = isSecureContext;
  readonly ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  private promptEvent = signal<InstallPrompt | null>(null);
  readonly nativeInstall = computed(() => !!this.promptEvent());
  private registration?: Promise<ServiceWorkerRegistration>;
  private checked = 0;
  private started = false;
  private reloadArmed = false;
  constructor() {
    const online = () => this.online.set(navigator.onLine);
    const prompt = (event: Event) => {
      event.preventDefault();
      this.promptEvent.set(event as InstallPrompt);
    };
    const installed = () => {
      this.installed.set(true);
      this.promptEvent.set(null);
    };
    const focus = () => {
      if (document.visibilityState === 'visible') void this.checkVersion();
    };
    const changed = () => {
      if (this.reloadArmed) location.reload();
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', installed);
    document.addEventListener('visibilitychange', focus);
    navigator.serviceWorker?.addEventListener('controllerchange', changed);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', online);
      window.removeEventListener('beforeinstallprompt', prompt);
      window.removeEventListener('appinstalled', installed);
      document.removeEventListener('visibilitychange', focus);
      navigator.serviceWorker?.removeEventListener('controllerchange', changed);
    });
  }
  start() {
    if (this.started) return;
    this.started = true;
    if (this.secure && 'serviceWorker' in navigator) {
      void this.ensureWorker().catch(() => {});
      void this.checkVersion();
    }
  }
  ensureWorker(): Promise<ServiceWorkerRegistration> {
    if (!this.secure || !('serviceWorker' in navigator))
      return Promise.reject(new Error('A instalação e os avisos precisam de HTTPS ou localhost.'));
    return (this.registration ??= (async () => {
      const previous = await navigator.serviceWorker.getRegistration('/');
      for (const worker of [previous?.active, previous?.waiting, previous?.installing]) {
        if (worker && new URL(worker.scriptURL).pathname !== '/notifications-sw.js')
          throw new Error(
            'Existe outro serviço do app neste navegador. Atualize antes de continuar.',
          );
      }
      const registration = await navigator.serviceWorker.register(
        '/notifications-sw.js?v=' + encodeURIComponent(version),
        { scope: '/', updateViaCache: 'none' },
      );
      const waiting = () => {
        if (registration.waiting && navigator.serviceWorker.controller)
          this.updateAvailable.set(true);
      };
      waiting();
      registration.addEventListener('updatefound', () =>
        registration.installing?.addEventListener('statechange', waiting),
      );
      await navigator.serviceWorker.ready;
      return registration;
    })().catch((error) => {
      this.registration = undefined;
      throw error;
    }));
  }
  private async checkVersion() {
    if (!this.online() || Date.now() - this.checked < 60000) return;
    this.checked = Date.now();
    try {
      const response = await fetch('/version.json', { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) return;
      const value = await response.json();
      if (typeof value.version === 'string' && value.version !== version)
        this.updateAvailable.set(true);
    } catch {
      /* Connectivity never turns into a successful command. */
    }
  }
  async install(): Promise<boolean> {
    const event = this.promptEvent();
    if (!event) return false;
    this.promptEvent.set(null);
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') this.installed.set(true);
    return true;
  }
  async update() {
    const registration = await navigator.serviceWorker?.getRegistration('/');
    if (registration?.waiting) {
      this.reloadArmed = true;
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else location.reload();
  }
}
