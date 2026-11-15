/* Minimal typings + loader for the YouTube IFrame Player API. */
export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setPlaybackRate(r: number): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
}

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer; PlayerState: Record<string, number> };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<void> | null = null;

export function loadYouTubeAPI(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      loading = null;
      reject(new Error('Could not load YouTube. Check your internet connection.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1, 12) || null;
    if (u.hostname.includes('youtube')) {
      const v = u.searchParams.get('v');
      if (v) return v.slice(0, 11);
      const m = u.pathname.match(/\/(embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

export function youtubeClipLink(id: string, start: number, end: number) {
  return `https://www.youtube.com/embed/${id}?start=${Math.floor(start)}&end=${Math.ceil(end)}&autoplay=1`;
}
