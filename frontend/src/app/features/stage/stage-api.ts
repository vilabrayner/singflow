import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../core/http/api-client';
export interface Suggestion {
  participantId: string;
  name: string;
  tableLabel: string | null;
  completed: number;
  requestId: string | null;
  title: string | null;
  artist: string | null;
  reason: string;
}
export interface StageCall {
  id: string;
  participantId: string;
  participantName: string;
  requestId: string | null;
  title: string | null;
  artist: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  acceptedAt: string | null;
}
export interface StageWait {
  participantId: string;
  name: string;
  manualRelease: boolean;
  remaining: number;
}
export interface StageView {
  suggestions: Suggestion[];
  active: StageCall | null;
  history: StageCall[];
  waits: StageWait[];
  paused?: Suggestion[];
}
@Injectable({ providedIn: 'root' })
export class StageApi {
  private readonly api = inject(ApiClient);
  snapshot(session: string) {
    return this.api.get<StageView>(`/sessions/${session}/stage`);
  }
  confirm(
    session: string,
    operationId: string,
    suggestion: Pick<Suggestion, 'participantId' | 'requestId'>,
    song?: { title: string; artist: string; selectionToken?: string },
    allowOutOfOrder = false,
  ) {
    return this.api.post<StageView>(`/sessions/${session}/stage/calls`, {
      operationId,
      participantId: suggestion.participantId,
      expectedRequestId: suggestion.requestId,
      ...song,
      ...(allowOutOfOrder ? { allowOutOfOrder: true } : {}),
    });
  }
  reorder(session: string, operationId: string, expectedOrder: string[], order: string[]) {
    return this.api.post<StageView>(`/sessions/${session}/stage/reorder`, {
      operationId,
      expectedOrder,
      order,
    });
  }
  resolve(session: string, call: string, outcome: string) {
    return this.api.post<StageView>(`/sessions/${session}/stage/calls/${call}/resolve`, {
      outcome,
    });
  }
  availability(session: string, person: string, action: string) {
    return this.api.post<StageView>(`/sessions/${session}/stage/participants/${person}/${action}`);
  }
}
export function callStatus(status: string): string {
  return (
    (
      {
        CALLED: 'Convocada',
        COMPLETED: 'Concluída',
        ABSENT: 'Não compareceu',
        DECLINED: 'Recusou por agora',
        CANCELLED: 'Cancelada por engano',
        LEFT: 'Desistiu',
      } as Record<string, string>
    )[status] ?? status
  );
}
