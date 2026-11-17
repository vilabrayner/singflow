export interface StreamingProvider {
  type: string;
  label: string;
  icon: string;
}
export interface StreamingLink extends StreamingProvider {
  songId: string;
  url: string | null;
  version: number;
}
export interface StreamingSong {
  id: string;
  title: string;
  artist: string | null;
}
export interface StreamingTrack {
  type: string;
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  url: string;
}
export interface StreamingPage {
  provider: StreamingProvider;
  items: StreamingTrack[];
  page: number;
  hasMore: boolean;
}
// Allowlisted presentation/navigation adapters. Adding a platform never requires changing the picker.
const platforms: Record<string, { icon: string; normalize: (url: URL) => string | null }> = {
  spotify: {
    icon: 'fa-spotify',
    normalize: (url) =>
      /^(?:\/intl-[a-z]{2})?\/track\/[A-Za-z0-9]{22}\/?$/.test(url.pathname) &&
      url.hostname === 'open.spotify.com'
        ? 'https://open.spotify.com/track/' + url.pathname.replace(/\/$/, '').split('/').pop()
        : null,
  },
  youtube: {
    icon: 'fa-youtube',
    normalize: (url) => {
      let id: string | null = null;
      if (url.hostname === 'youtu.be' && /^\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname))
        id = url.pathname.slice(1).replace(/\/$/, '');
      else if (
        ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(
          url.hostname,
        )
      ) {
        if (
          ['/watch', '/watch/'].includes(url.pathname) &&
          url.searchParams.getAll('v').length === 1
        )
          id = url.searchParams.get('v');
        else if (/^\/(shorts|live|embed)\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname))
          id = url.pathname.replace(/\/$/, '').split('/').pop() ?? null;
      }
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? 'https://www.youtube.com/watch?v=' + id : null;
    },
  },
  deezer: {
    icon: 'fa-deezer',
    normalize: (url) =>
      /^(?:\/[a-z]{2})?\/track\/\d+\/?$/.test(url.pathname) &&
      ['www.deezer.com', 'deezer.com'].includes(url.hostname)
        ? url.href
        : null,
  },
};
export function streamingIcon(provider: StreamingProvider): string {
  const icon = platforms[provider.type]?.icon;
  return icon && provider.icon === icon ? 'fa-brands ' + icon : 'fa-solid fa-music';
}
export function streamingUrl(type: string, value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return platforms[type]?.normalize(url) ?? null;
  } catch {
    return null;
  }
}
