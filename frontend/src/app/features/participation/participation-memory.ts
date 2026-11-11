import { Injectable, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiClient } from '../../core/http/api-client';

@Injectable({ providedIn: 'root' })
export class ParticipationMemory {
  private readonly key = 'singflow.lastParticipation';
  current(): string | null {
    try {
      const session = localStorage.getItem(this.key);
      return session &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session)
        ? session
        : null;
    } catch {
      return null;
    }
  }
  remember(session: string) {
    try {
      localStorage.setItem(this.key, session);
    } catch {
      // Participation remains available through its link if browser storage is unavailable.
    }
  }
  forget(session: string) {
    try {
      if (this.current() === session) localStorage.removeItem(this.key);
    } catch {
      // Browser storage may be disabled.
    }
  }
}

export const resumeParticipation: CanActivateFn = async () => {
  const memory = inject(ParticipationMemory);
  const api = inject(ApiClient);
  const router = inject(Router);
  const session = memory.current();
  if (!session) return true;
  const destination = router.createUrlTree(['/participante', session, 'vinculado']);
  try {
    const view = await api.get<{ session: { status: string } }>(`/participation/${session}/me`);
    if (view.session.status === 'OPEN') return destination;
    memory.forget(session);
    return true;
  } catch (error) {
    if (error instanceof HttpErrorResponse && [401, 403, 404, 410].includes(error.status)) {
      memory.forget(session);
      return true;
    }
    // Preserve the remembered session during network failures so the panel can offer a retry.
    return destination;
  }
};
