import { KaraokeSession, Participant, SongRequest } from '../sessions/session-api';
export interface OwnView {
  session: KaraokeSession;
  participant: Participant;
  requests: SongRequest[];
  active: {
    id: string;
    title: string | null;
    artist: string | null;
    acceptedAt: string | null;
  } | null;
  history: {
    id: string;
    requestId?: string | null;
    title: string | null;
    artist: string | null;
    status: string;
  }[];
  suggested: boolean;
  expiresAt: string | null;
  queuePosition: number | null;
  canReturn: boolean;
}
export function participantStatus(value: string) {
  return (
    (
      {
        ACTIVE: 'Participando',
        PAUSED: 'Pausado — fale com o anfitrião para retomar.',
        SUSPENDED: 'Aguardando a rodada dos demais participantes.',
        INACTIVE: 'Inativo por ausência — fale com o anfitrião para retornar.',
        LEFT: 'Fora da fila',
        PENDING: 'Pendente',
        RESERVED: 'Convocada — fale com o anfitrião para alterar.',
        COMPLETED: 'Concluída',
        CANCELLED: 'Cancelada',
        ABSENT: 'Não compareceu',
        DECLINED: 'Desistência temporária',
      } as Record<string, string>
    )[value] ?? value
  );
}
