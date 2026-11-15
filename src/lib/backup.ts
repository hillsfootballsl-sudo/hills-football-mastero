import { db } from '../db';

/**
 * Backup file layout (".mastero"):
 *   "MASTERO1" (8 bytes) | header length (uint32 LE) | header JSON | video blobs back to back
 * Video blobs are appended by reference (Blob parts), so even multi-GB backups never
 * load into memory at once, and restore slices them straight back out of the file.
 */
const MAGIC = 'MASTERO1';
const TABLES = ['matches', 'players', 'tagTypes', 'events', 'clips', 'presentations', 'feedback'] as const;

export async function createBackup(includeVideos: boolean): Promise<Blob> {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  const videos = includeVideos ? await db.videos.toArray() : [];
  let offset = 0;
  const index = videos.map((v) => {
    const entry = { id: v.id, mimeType: v.mimeType, size: v.blob.size, offset };
    offset += v.blob.size;
    return entry;
  });
  const header = new TextEncoder().encode(JSON.stringify({ app: 'hills-football-mastero', version: 1, exportedAt: new Date().toISOString(), data, videos: index }));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, header.length, true);
  return new Blob([MAGIC, len, header, ...videos.map((v) => v.blob)], { type: 'application/octet-stream' });
}

export async function restoreBackup(file: Blob): Promise<{ matches: number; videos: number }> {
  const magic = await file.slice(0, 8).text();
  if (magic !== MAGIC) throw new Error('This is not a Hills Football Mastero backup file.');
  const len = new DataView(await file.slice(8, 12).arrayBuffer()).getUint32(0, true);
  const header = JSON.parse(await file.slice(12, 12 + len).text());
  const base = 12 + len;
  const videoIds = new Set<number>();
  await db.transaction('rw', [...TABLES.map((t) => db.table(t)), db.videos], async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      await db.table(t).bulkAdd(header.data[t] ?? []);
    }
    await db.videos.clear();
    for (const v of header.videos as { id: number; mimeType: string; size: number; offset: number }[]) {
      const blob = file.slice(base + v.offset, base + v.offset + v.size, v.mimeType);
      await db.videos.add({ id: v.id, blob, mimeType: v.mimeType, size: v.size });
      videoIds.add(v.id);
    }
    // Matches whose video wasn't included keep their details and tags but need footage re-attached.
    await db.matches.toCollection().modify((m) => {
      if (m.source.kind === 'file' && !videoIds.has(m.source.videoId)) m.source = { kind: 'none' };
    });
  });
  return { matches: (header.data.matches ?? []).length, videos: videoIds.size };
}
