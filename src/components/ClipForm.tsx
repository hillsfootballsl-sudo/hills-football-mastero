import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Clip, type Player, type TagType } from '../db';
import { PlayerChips } from './ui';

export const OBJECTIVES = [
  'Playing out from the back',
  'Breaking lines',
  'Width & switching play',
  'Final-third combinations',
  'Counter-pressing',
  'Pressing triggers',
  'Defensive shape & compactness',
  'Defending transitions',
  'Attacking transitions',
  'Set-piece organisation',
  'Individual technique',
  'Goalkeeper distribution',
];

export type ClipDraft = Pick<Clip, 'title' | 'tagTypeId' | 'playerIds' | 'objective' | 'teachingPoint'>;

export function useObjectives() {
  const used = useLiveQuery(() => db.clips.orderBy('objective').uniqueKeys(), []) as string[] | undefined;
  return Array.from(new Set([...(used ?? []).filter(Boolean), ...OBJECTIVES]));
}

export default function ClipForm({ value, onChange, tagTypes, players }: { value: ClipDraft; onChange: (v: ClipDraft) => void; tagTypes: TagType[]; players: Player[] }) {
  const objectives = useObjectives();
  const set = <K extends keyof ClipDraft>(k: K, v: ClipDraft[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="stack">
      <label>
        Clip title
        <input value={value.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Press trigger on back pass" autoFocus />
      </label>
      <div className="form-grid">
        <label>
          Event type
          <select value={value.tagTypeId ?? ''} onChange={(e) => set('tagTypeId', e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">None</option>
            {tagTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tactical objective
          <input list="objectives" value={value.objective} onChange={(e) => set('objective', e.target.value)} placeholder="Pick or type…" />
          <datalist id="objectives">
            {objectives.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </label>
      </div>
      <label>
        Teaching point
        <textarea rows={2} value={value.teachingPoint} onChange={(e) => set('teachingPoint', e.target.value)} placeholder="What should players see and learn from this moment?" />
      </label>
      <div>
        <div className="label">Players involved</div>
        <PlayerChips players={players} selected={value.playerIds} onChange={(ids) => set('playerIds', ids)} compact />
      </div>
    </div>
  );
}
