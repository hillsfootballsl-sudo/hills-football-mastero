import Dexie, { type EntityTable } from 'dexie';

export type Team = 'us' | 'them';

export type VideoSource =
  | { kind: 'file'; videoId: number; fileName?: string }
  | { kind: 'youtube'; youtubeId: string; url: string }
  | { kind: 'none' };

export interface Match {
  id: number;
  title: string;
  opponent: string;
  date: string; // yyyy-mm-dd
  competition: string;
  venue: 'home' | 'away' | 'neutral';
  scoreFor?: number;
  scoreAgainst?: number;
  source: VideoSource;
  /** Video time (seconds) at which each half kicked off; used to sync live-tagged events to the video. */
  kickoffs: { 1?: number; 2?: number };
  duration?: number;
  createdAt: number;
}

/** Stored separately so listing matches never loads large video blobs. */
export interface VideoBlob {
  id: number;
  blob: Blob;
  mimeType: string;
  size: number;
}

export interface RecordingChunk {
  id: number;
  sessionId: string;
  seq: number;
  blob: Blob;
  mimeType: string;
  startedAt: number;
}

export interface Player {
  id: number;
  name: string;
  number?: number;
  position: string;
  active: boolean;
  createdAt: number;
}

export interface TagType {
  id: number;
  name: string;
  color: string;
  hotkey?: string;
  category: string;
  preRoll: number;
  postRoll: number;
  order: number;
}

export interface TagEvent {
  id: number;
  matchId: number;
  tagTypeId: number;
  team: Team;
  playerIds: number[];
  note: string;
  /** 'video': `time` is video seconds. 'live': `time` is the match clock within `half`, synced via match.kickoffs. */
  mode: 'video' | 'live';
  time: number;
  half: 1 | 2;
  createdAt: number;
}

export type Shape =
  | { kind: 'arrow' | 'line' | 'dashed'; color: string; width: number; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'circle'; color: string; width: number; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'free'; color: string; width: number; points: [number, number][] }
  | { kind: 'zone'; color: string; width: number; points: [number, number][] }
  | { kind: 'text'; color: string; width: number; x: number; y: number; text: string };

/** A freeze-frame drawing inside a clip: playback pauses at `time` for `hold` seconds showing `shapes`. */
export interface Drawing {
  id: string;
  time: number;
  hold: number;
  shapes: Shape[];
}

export interface Clip {
  id: number;
  matchId: number;
  title: string;
  start: number;
  end: number;
  tagTypeId?: number;
  eventId?: number;
  playerIds: number[];
  objective: string;
  teachingPoint: string;
  drawings: Drawing[];
  createdAt: number;
}

export interface PresentationItem {
  clipId: number;
  notes: string;
}

export interface PresentationSection {
  id: string;
  objective: string;
  items: PresentationItem[];
}

export interface Presentation {
  id: number;
  title: string;
  audience: string;
  summary: string;
  sections: PresentationSection[];
  createdAt: number;
  updatedAt: number;
}

export type FeedbackKind = 'strength' | 'improve' | 'focus';

export interface Feedback {
  id: number;
  playerId: number;
  matchId?: number;
  clipId?: number;
  kind: FeedbackKind;
  text: string;
  createdAt: number;
}

class MasteroDB extends Dexie {
  matches!: EntityTable<Match, 'id'>;
  videos!: EntityTable<VideoBlob, 'id'>;
  recordingChunks!: EntityTable<RecordingChunk, 'id'>;
  players!: EntityTable<Player, 'id'>;
  tagTypes!: EntityTable<TagType, 'id'>;
  events!: EntityTable<TagEvent, 'id'>;
  clips!: EntityTable<Clip, 'id'>;
  presentations!: EntityTable<Presentation, 'id'>;
  feedback!: EntityTable<Feedback, 'id'>;

  constructor() {
    super('hills-football-mastero');
    this.version(1).stores({
      matches: '++id, date, createdAt',
      videos: '++id',
      recordingChunks: '++id, sessionId, [sessionId+seq]',
      players: '++id, name, number',
      tagTypes: '++id, order',
      events: '++id, matchId, tagTypeId, *playerIds, createdAt',
      clips: '++id, matchId, tagTypeId, *playerIds, objective, createdAt',
      presentations: '++id, updatedAt',
      feedback: '++id, playerId, matchId, clipId, createdAt',
    });
    this.on('populate', (tx) => {
      tx.table('tagTypes').bulkAdd(DEFAULT_TAG_TYPES.map((t, i) => ({ ...t, order: i })));
    });
  }
}

export const DEFAULT_TAG_TYPES: Omit<TagType, 'id' | 'order'>[] = [
  { name: 'Goal', color: '#c8f04a', hotkey: 'g', category: 'Attack', preRoll: 12, postRoll: 6 },
  { name: 'Shot', color: '#9be15d', hotkey: 's', category: 'Attack', preRoll: 8, postRoll: 4 },
  { name: 'Chance Created', color: '#4ade80', hotkey: 'c', category: 'Attack', preRoll: 10, postRoll: 4 },
  { name: 'Build-up', color: '#5eb8ff', hotkey: 'b', category: 'In possession', preRoll: 4, postRoll: 14 },
  { name: 'Transition (Att)', color: '#38d6c8', hotkey: 't', category: 'Transition', preRoll: 3, postRoll: 10 },
  { name: 'Transition (Def)', color: '#f59e0b', hotkey: 'y', category: 'Transition', preRoll: 3, postRoll: 10 },
  { name: 'Pressing', color: '#f472b6', hotkey: 'p', category: 'Out of possession', preRoll: 4, postRoll: 8 },
  { name: 'Turnover', color: '#fb7185', hotkey: 'u', category: 'Out of possession', preRoll: 6, postRoll: 4 },
  { name: 'Set Piece', color: '#a78bfa', hotkey: 'k', category: 'Set piece', preRoll: 3, postRoll: 10 },
  { name: 'Save', color: '#fbbf24', hotkey: 'v', category: 'Defence', preRoll: 6, postRoll: 3 },
  { name: 'Foul', color: '#94a3b8', hotkey: 'f', category: 'Discipline', preRoll: 5, postRoll: 3 },
  { name: 'Coaching Point', color: '#e2e8f0', hotkey: 'x', category: 'Coaching', preRoll: 5, postRoll: 5 },
];

export const db = new MasteroDB();

/** Resolve an event's position on the match video, or null when a live event's half isn't synced yet. */
export function eventVideoTime(ev: TagEvent, match: Match | null | undefined): number | null {
  if (ev.mode === 'video') return ev.time;
  const k = match?.kickoffs?.[ev.half];
  if (k === undefined || k === null) return null;
  return k + ev.time;
}

export async function deleteMatch(id: number) {
  await db.transaction('rw', [db.matches, db.videos, db.events, db.clips, db.feedback, db.presentations], async () => {
    const m = await db.matches.get(id);
    if (m?.source.kind === 'file') await db.videos.delete(m.source.videoId);
    const clipIds = (await db.clips.where('matchId').equals(id).primaryKeys()) as number[];
    await removeClipsFromPresentations(clipIds);
    await db.clips.where('matchId').equals(id).delete();
    await db.events.where('matchId').equals(id).delete();
    await db.feedback.where('matchId').equals(id).modify({ matchId: undefined });
    await db.matches.delete(id);
  });
}

export async function deleteClip(id: number) {
  await db.transaction('rw', [db.clips, db.presentations, db.feedback], async () => {
    await removeClipsFromPresentations([id]);
    await db.feedback.where('clipId').equals(id).modify({ clipId: undefined });
    await db.clips.delete(id);
  });
}

async function removeClipsFromPresentations(clipIds: number[]) {
  if (!clipIds.length) return;
  const set = new Set(clipIds);
  const pres = await db.presentations.toArray();
  for (const p of pres) {
    let changed = false;
    const sections = p.sections.map((s) => {
      const items = s.items.filter((it) => !set.has(it.clipId));
      if (items.length !== s.items.length) changed = true;
      return { ...s, items };
    });
    if (changed) await db.presentations.update(p.id, { sections, updatedAt: Date.now() });
  }
}

export async function deletePlayer(id: number) {
  await db.transaction('rw', [db.players, db.events, db.clips, db.feedback], async () => {
    await db.events.where('playerIds').equals(id).modify((e) => {
      e.playerIds = e.playerIds.filter((p) => p !== id);
    });
    await db.clips.where('playerIds').equals(id).modify((c) => {
      c.playerIds = c.playerIds.filter((p) => p !== id);
    });
    await db.feedback.where('playerId').equals(id).delete();
    await db.players.delete(id);
  });
}

export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
