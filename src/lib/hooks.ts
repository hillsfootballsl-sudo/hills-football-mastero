import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Match } from '../db';

/** Object URL for a match's stored video blob, revoked on unmount. */
export function useMatchVideoUrl(match: Match | null | undefined): string | null {
  const videoId = match?.source.kind === 'file' ? match.source.videoId : undefined;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (videoId === undefined) {
      setUrl(null);
      return;
    }
    let u: string | null = null;
    let cancelled = false;
    db.videos.get(videoId).then((v) => {
      if (cancelled || !v) return;
      u = URL.createObjectURL(v.blob);
      setUrl(u);
    });
    return () => {
      cancelled = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [videoId]);
  return url;
}

export function usePlayers() {
  return useLiveQuery(() => db.players.toArray().then((ps) => sortPlayers(ps)), []) ?? [];
}

export function sortPlayers<T extends { number?: number; name: string }>(ps: T[]): T[] {
  return [...ps].sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name));
}

export function useTagTypes() {
  return useLiveQuery(() => db.tagTypes.orderBy('order').toArray(), []) ?? [];
}

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (nv: T) => {
    setV(nv);
    try {
      localStorage.setItem(key, JSON.stringify(nv));
    } catch {
      /* ignore */
    }
  };
  return [v, set];
}
