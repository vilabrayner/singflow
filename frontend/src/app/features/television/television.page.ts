import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiClient } from '../../core/http/api-client';
import { Realtime } from '../../core/realtime/realtime';
import { BrandLogo } from '../../shared/components/brand-logo';

interface TelevisionView {
  sessionId: string;
  sessionName: string;
  status: string;
  venueName: string;
  venueLogo: string;
  brandLogo: string;
  projectName: string;
  backgroundUrl: string | null;
  instagram: string;
  entryUrl: string | null;
  cue: {
    name: string;
    title: string | null;
    artist: string | null;
    called: boolean;
    accepted: boolean;
  } | null;
}
@Component({
  imports: [BrandLogo],
  templateUrl: './television.page.html',
  styleUrl: './television.page.css',
})
export class TelevisionPage {
  private readonly api = inject(ApiClient);
  private readonly realtime = inject(Realtime);
  private readonly destroy = inject(DestroyRef);
  readonly view = signal<TelevisionView | null>(null);
  readonly qr = signal('');
  readonly instagramQr = signal('');
  readonly error = signal('');
  readonly brokenBackground = signal(false);
  readonly artwork = computed(() => !!this.view()?.backgroundUrl && !this.brokenBackground());
  readonly connected = signal(false);
  private stop?: () => void;
  private generation = 0;
  private lastEntry = '';
  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const session = params.get('session') ?? '';
        this.stop?.();
        const generation = ++this.generation;
        this.view.set(null);
        this.qr.set('');
        this.instagramQr.set('');
        this.brokenBackground.set(false);
        this.lastEntry = '';
        this.error.set('');
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session)) {
          this.error.set('Sessão não encontrada.');
          return;
        }
        this.stop = this.realtime.watch({
          path: `/public/tv/${session}/realtime/tickets`,
          connectionChanged: (value) => this.connected.set(value),
          update: () => this.refresh(session, generation),
        });
      });
    this.destroy.onDestroy(() => this.stop?.());
  }
  private makeQr(url: string) {
    return import('qrcode').then(({ default: qr }) =>
      qr.toDataURL(url, {
        width: 360,
        margin: 3,
        errorCorrectionLevel: 'M',
        color: { dark: '#0B1E3F', light: '#ffffff' },
      }),
    );
  }
  private async refresh(session: string, generation: number) {
    try {
      const view = await this.api.get<TelevisionView>(`/public/tv/${session}`, {
        background: true,
      });
      if (generation !== this.generation) return;
      this.error.set('');
      const previous = this.view();
      this.view.set(view);
      if (previous?.backgroundUrl !== view.backgroundUrl) this.brokenBackground.set(false);
      if (previous?.instagram !== view.instagram) {
        this.instagramQr.set('');
        if (view.instagram) {
          const image = await this.makeQr('https://www.instagram.com/' + view.instagram + '/');
          if (generation === this.generation && this.view()?.instagram === view.instagram)
            this.instagramQr.set(image);
        }
      }
      if (!view.entryUrl) {
        this.qr.set('');
        this.lastEntry = '';
      } else if (view.entryUrl !== this.lastEntry) {
        const image = await this.makeQr(view.entryUrl);
        if (generation !== this.generation || this.view()?.entryUrl !== view.entryUrl) return;
        this.lastEntry = view.entryUrl;
        this.qr.set(image);
      }
    } catch (error) {
      if (generation !== this.generation) return;
      this.error.set(
        error instanceof HttpErrorResponse && [403, 404, 410].includes(error.status)
          ? 'A TV não está liberada para esta sessão. Peça ao anfitrião para abrir as opções da TV.'
          : 'Reconectando à sessão…',
      );
      this.qr.set('');
      if (error instanceof HttpErrorResponse && [403, 404, 410].includes(error.status)) {
        this.view.set(null);
        this.stop?.();
      }
    }
  }
  async fullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      this.error.set('Use a opção de tela cheia do navegador.');
    }
  }
}
