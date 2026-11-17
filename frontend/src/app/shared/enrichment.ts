export interface ResourceCandidate {
  type: string;
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  url: string;
  recommended: boolean;
}
export interface PreparedResource {
  type: string;
  state: string;
  message: string;
  candidates: ResourceCandidate[];
}
export function preparationMessage(resource: PreparedResource): string {
  switch (resource.state) {
    case 'READY':
      return 'Sugestões preparadas em segundo plano. Confira antes de salvar.';
    case 'QUEUED':
    case 'PROCESSING':
      return 'Sugestões em preparação. Você também pode usar a busca agora.';
    case 'WAITING_METADATA':
      return 'Informe o artista no catálogo para preparar as sugestões.';
    case 'NOT_FOUND':
      return 'A busca automática não encontrou sugestões. Você pode pesquisar novamente.';
    case 'FAILED':
      return 'A busca automática não foi concluída. Você pode pesquisar manualmente.';
    case 'REFERENCE_SET':
      return 'A referência oficial já está definida.';
    default:
      return resource.message;
  }
}
export function hasPreparedResource(value: PreparedResource): boolean {
  return (
    !!value &&
    typeof value.state === 'string' &&
    Array.isArray(value.candidates) &&
    !['NOT_SCHEDULED', 'STALE'].includes(value.state)
  );
}
