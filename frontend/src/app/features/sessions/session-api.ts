import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../core/http/api-client';

export interface KaraokeSession {
  id: string;
  name: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  createdAt: string;
}
export interface Participant {
  id: string;
  name: string;
  tableLabel: string | null;
  status: 'ACTIVE' | 'LEFT';
  origin: string;
  checkedInAt: string;
  checkInOrder: number;
  completedPerformances: number;
}
export interface SongRequest {
  id: string;
  participantId: string;
  title: string;
  artist: string | null;
  status: 'PENDING' | 'CANCELLED';
  createdAt: string;
}
export interface RegistrationInput {
  operationId: string;
  name: string;
  tableLabel: string;
  title: string;
  artist: string;
}

@Injectable({ providedIn: 'root' })
export class SessionApi {
  private readonly api = inject(ApiClient);
  list() {
    return this.api.get<KaraokeSession[]>('/sessions');
  }
  create(name: string, operationId: string) {
    return this.api.post<KaraokeSession>('/sessions', { name, operationId });
  }
  transition(id: string, action: 'open' | 'close') {
    return this.api.post<KaraokeSession>(`/sessions/${id}/${action}`);
  }
  participants(id: string) {
    return this.api.get<Participant[]>(`/sessions/${id}/participants`);
  }
  requests(id: string) {
    return this.api.get<SongRequest[]>(`/sessions/${id}/requests`);
  }
  register(id: string, input: RegistrationInput) {
    return this.api.post(`/sessions/${id}/participants`, input);
  }
  add(
    id: string,
    participant: string,
    input: { operationId: string; title: string; artist: string },
  ) {
    return this.api.post(`/sessions/${id}/participants/${participant}/requests`, input);
  }
  leave(id: string, participant: string) {
    return this.api.post(`/sessions/${id}/participants/${participant}/leave`);
  }
}
