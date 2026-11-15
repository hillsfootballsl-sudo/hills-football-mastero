import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, type Clip, type Presentation } from '../db';
import { Modal, toast } from './ui';

/** Adds clips to a presentation, grouping them into sections by tactical objective. */
export async function addClipsToPresentation(p: Presentation, clips: Clip[]) {
  const sections = p.sections.map((s) => ({ ...s, items: [...s.items] }));
  const existing = new Set(sections.flatMap((s) => s.items.map((i) => i.clipId)));
  for (const c of clips) {
    if (existing.has(c.id)) continue;
    const obj = c.objective || 'Key moments';
    let sec = sections.find((s) => s.objective.toLowerCase() === obj.toLowerCase());
    if (!sec) {
      sec = { id: uid(), objective: obj, items: [] };
      sections.push(sec);
    }
    sec.items.push({ clipId: c.id, notes: c.teachingPoint });
  }
  await db.presentations.update(p.id, { sections, updatedAt: Date.now() });
}

export default function AddToPresentation({ clips, onClose }: { clips: Clip[]; onClose: () => void }) {
  const nav = useNavigate();
  const pres = useLiveQuery(() => db.presentations.orderBy('updatedAt').reverse().toArray()) ?? [];
  const [title, setTitle] = useState('');
  const add = async (p: Presentation) => {
    await addClipsToPresentation(p, clips);
    toast(`Added to "${p.title}"`);
    onClose();
  };
  const create = async () => {
    const now = Date.now();
    const id = (await db.presentations.add({ title: title.trim() || 'Team review', audience: 'Squad', summary: '', sections: [], createdAt: now, updatedAt: now } as unknown as Presentation)) as number;
    const p = (await db.presentations.get(id))!;
    await addClipsToPresentation(p, clips);
    onClose();
    nav(`/presentations/${id}`);
  };
  return (
    <Modal title={`Add ${clips.length} clip${clips.length === 1 ? '' : 's'} to a presentation`} onClose={onClose}>
      <p className="muted small">Clips are grouped into sections by their tactical objective.</p>
      {pres.length > 0 && (
        <ul className="list">
          {pres.map((p) => (
            <li key={p.id}>
              <button className="list-row" onClick={() => add(p)}>
                <span>
                  <b>{p.title}</b> <span className="muted small">{p.sections.reduce((n, s) => n + s.items.length, 0)} clips</span>
                </span>
                <span className="link">Add</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row gap-s">
        <input className="grow" placeholder="New presentation title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn primary" onClick={create}>
          Create new
        </button>
      </div>
    </Modal>
  );
}
