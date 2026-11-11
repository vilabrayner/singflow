import { ParticipationMemory } from './participation-memory';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiClient, apiError } from '../../core/http/api-client';
import { PanelHeader } from '../../shared/components/panel-header';
import { SurfaceCard } from '../../shared/components/surface-card';

interface ClaimInfo {
  name: string;
  sessionName: string;
  currentId: string | null;
  currentName: string | null;
}

@Component({
  imports: [PanelHeader, SurfaceCard],
  template: `
    <app-panel-header />
    <section class="participant-page" id="participant-content" tabindex="-1">
      <app-surface-card labelledBy="claim-title">
        <h2 id="claim-title">Vincular participação</h2>
        @if (error()) {
          <p role="alert">{{ error() }}</p>
        }
        @if (info(); as invitation) {
          <p>{{ invitation.sessionName }}</p>
          <p>
            Assumir a participação de <strong>{{ invitation.name }}</strong> neste celular?
          </p>
          @if (invitation.currentId) {
            <p>
              Este celular já está vinculado à participação de {{ invitation.currentName }}. Ao
              confirmar a troca, você passará a gerenciar os pedidos de {{ invitation.name }}.
            </p>
          }
          <button
            type="button"
            class="sf-button sf-primary sf-full"
            [disabled]="busy()"
            (click)="claim(invitation)"
          >
            {{ invitation.currentId ? 'Confirmar troca de participação' : 'Confirmar vínculo' }}
          </button>
        } @else if (busy()) {
          <p role="status">Conferindo o QR Code…</p>
        } @else if (retry()) {
          <button type="button" class="sf-button sf-outline" (click)="preview()">
            Tentar novamente
          </button>
        }
      </app-surface-card>
    </section>
  `,
})
export class ClaimAccessPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiClient);
  private readonly memory = inject(ParticipationMemory);
  private readonly session = this.route.snapshot.paramMap.get('session') ?? '';
  private readonly code = this.route.snapshot.fragment ?? '';
  private readonly path = `/participation/${this.session}/mobile-access`;
  readonly info = signal<ClaimInfo | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly retry = signal(false);

  ngOnInit() {
    if (!/^[0-9a-f-]{36}$/i.test(this.session) || !/^[A-Za-z0-9_-]{43}$/.test(this.code)) {
      this.error.set('QR Code inválido. Peça outro ao anfitrião.');
      return;
    }
    void this.preview();
  }

  async preview() {
    this.busy.set(true);
    this.retry.set(false);
    try {
      this.info.set(await this.api.post<ClaimInfo>(`${this.path}/preview`, { code: this.code }));
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  async claim(invitation: ClaimInfo) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.post(`${this.path}/claim`, {
        code: this.code,
        replaceParticipantId: invitation.currentId,
      });
      this.memory.remember(this.session);
      await this.router.navigate(['/participante', this.session, 'vinculado'], {
        replaceUrl: true,
      });
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.info.set(null);
        this.error.set('O vínculo deste celular mudou. Revise e confirme novamente.');
        await this.preview();
      } else {
        this.showError(error);
      }
    } finally {
      this.busy.set(false);
    }
  }

  private showError(error: unknown) {
    if (error instanceof HttpErrorResponse && [404, 409, 410].includes(error.status)) {
      this.info.set(null);
      this.error.set(error.error?.detail ?? 'QR Code indisponível. Peça outro ao anfitrião.');
      return;
    }
    this.retry.set(true);
    this.error.set(apiError(error));
  }
}
