import { StreamingProvider } from '../../src/app/shared/streaming';

/** Mirrors the aggregate editor response; no provider requests are hidden in this fixture. */
export function songDetails<T extends { id: string; version: number }>(
  song: T,
  references: Record<string, string | null> = {},
  providers: StreamingProvider[] = [],
) {
  return {
    song,
    chord: {
      songId: song.id,
      officialUrl: references['cifra'] ?? null,
      effectiveUrl: references['cifra'] ?? null,
      version: song.version,
      personalUrl: null,
      personalVersion: 0,
      source: 'CATALOG',
      alternatives: [],
    },
    streaming: providers.map((provider) => ({
      ...provider,
      songId: song.id,
      url: references[provider.type] ?? null,
      version: song.version,
    })),
  };
}
