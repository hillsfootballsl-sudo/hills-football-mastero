import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, type Clip, type Presentation, type PresentationSection } from '../db';
import Icon from '../components/Icon';
import { useObjectives } from '../components/ClipForm';
import { Empty, Modal, TagBadge, toast } from '../components/ui';
import { useTagTypes } from '../lib/hooks';
import { fmtTime } from '../lib/format';

function move<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const a = [...arr];
  [a[i], a[j]] = [a[j], a[i]];
  return a;
}

export default function PresentationEditor() {
  const { id } = useParams();
  const pid = Number(id);
  const nav = useNavigate();
  const stored = useLiveQuery(() => db.presentations.get(pid).then((p) => p ?? null), [pid]);
  const clips = useLiveQuery(() => db.clips.toArray()) ?? [];
  const matches = useLiveQuery(() => db.matches.toArray()) ?? [];
  const tagTypes = useTagTypes();
  const objectives = useObjectives();
  const [p, setP] = useState<Presentation | null>(null);
  const [picker, setPicker] = useState<string | null>(null); // section id

  useEffect(() => {
    if (stored && !p) setP(stored);
  }, [stored, p]);

  // Autosave edits.
  useEffect(() => {
    if (!p) return;
    const t = setTimeout(() => db.presentations.put({ ...p, updatedAt: Date.now() }), 400);
    return () => clearTimeout(t);
  }, [p]);

  const clipById = useMemo(() => new Map(clips.map((c) => [c.id, c])), [clips]);
  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  if (stored === undefined) return <div className="page" />;
  if (stored === null) return <Empty icon="present" title="Presentation not found" />;
  if (!p) return <div className="page" />;

  const setSection = (sid: string, patch: Partial<PresentationSection>) => setP({ ...p, sections: p.sections.map((s) => (s.id === sid ? { ...s, ...patch } : s)) });
  const total = p.sections.reduce((n, s) => n + s.items.length, 0);
  const totalSecs = p.sections.reduce((n, s) => n + s.items.reduce((m, it) => {
    const c = clipById.get(it.clipId);
    return m + (c ? c.end - c.start + c.drawings.reduce((h, d) => h + d.hold, 0) : 0);
  }, 0), 0);

  const summaryText = () =>
    [
      `${p.title}${p.audience ? ` (${p.audience})` : ''}`,
      p.summary,
      '',
      ...p.sections.flatMap((s, i) => [
        `${i + 1}. ${s.objective}`,
        ...s.items.map((it) => {
          const c = clipById.get(it.clipId);
          return `   • ${c?.title ?? 'Clip'}${it.notes ? ` – ${it.notes}` : ''}`;
        }),
      ]),
      '',
      'Hills Football Mastero',
    ]
      .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
      .join('\n');

  return (
    <div className="page narrow-wide">
      <div className="analyze-head">
        <div>
          <Link to="/presentations" className="link small">
            <Icon name="left" size={14} /> Presentations
          </Link>
          <input className="title-input" value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} aria-label="Presentation title" />
          <div className="muted small">
            {p.sections.length} objectives · {total} clips · about {Math.ceil(totalSecs / 60)} min of video
          </div>
        </div>
        <div className="row gap-s wrap">
          <button
            className="btn"
            onClick={async () => {
              const text = summaryText();
              try {
                if (navigator.share) await navigator.share({ title: p.title, text });
                else {
                  await navigator.clipboard.writeText(text);
                  toast('Summary copied');
                }
              } catch {
                /* cancelled */
              }
            }}
          >
            <Icon name="share" /> Share summary
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm('Delete this presentation? Clips are kept.')) return;
              await db.presentations.delete(p.id);
              nav('/presentations', { replace: true });
            }}
          >
            <Icon name="trash" />
          </button>
          <Link to={`/presentations/${p.id}/present`} className={`btn primary ${total ? '' : 'disabled'}`}>
            <Icon name="play" /> Present
          </Link>
        </div>
      </div>

      <section className="panel">
        <div className="form-grid">
          <label>
            Audience
            <input value={p.audience} onChange={(e) => setP({ ...p, audience: e.target.value })} placeholder="Squad, defenders, U14s…" />
          </label>
          <label>
            Key message
            <input value={p.summary} onChange={(e) => setP({ ...p, summary: e.target.value })} placeholder="The one thing players should leave with" />
          </label>
        </div>
      </section>

      {p.sections.map((s, si) => (
        <section key={s.id} className="panel section-panel">
          <div className="section-top">
            <span className="step-n">{si + 1}.</span>
            <input className="grow obj-input" list="pres-objectives" value={s.objective} onChange={(e) => setSection(s.id, { objective: e.target.value })} placeholder="Tactical objective" />
            <div className="row gap-s">
              <button className="icon-btn sm" title="Move up" onClick={() => setP({ ...p, sections: move(p.sections, si, -1) })}>
                <Icon name="up" size={16} />
              </button>
              <button className="icon-btn sm" title="Move down" onClick={() => setP({ ...p, sections: move(p.sections, si, 1) })}>
                <Icon name="down" size={16} />
              </button>
              <button
                className="icon-btn sm"
                title="Remove section"
                onClick={() => (!s.items.length || confirm('Remove this objective and its clips from the presentation?')) && setP({ ...p, sections: p.sections.filter((x) => x.id !== s.id) })}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          </div>
          <ul className="pres-items">
            {s.items.map((it, ii) => {
              const c = clipById.get(it.clipId);
              if (!c) return null;
              return (
                <li key={it.clipId} className="pres-item">
                  <div className="pres-item-head">
                    <span className="mono muted">{String.fromCharCode(97 + ii)}</span>
                    <Link to={`/clips/${c.id}`} className="grow">
                      <b>{c.title}</b>
                      <span className="muted small block">
                        {matchById.get(c.matchId)?.title} · {fmtTime(c.end - c.start)}
                        {c.drawings.length ? ` · ${c.drawings.length} drawing${c.drawings.length > 1 ? 's' : ''}` : ''}
                      </span>
                    </Link>
                    <TagBadge t={tagTypes.find((t) => t.id === c.tagTypeId)} />
                    <button className="icon-btn sm" onClick={() => setSection(s.id, { items: move(s.items, ii, -1) })} title="Move up">
                      <Icon name="up" size={16} />
                    </button>
                    <button className="icon-btn sm" onClick={() => setSection(s.id, { items: move(s.items, ii, 1) })} title="Move down">
                      <Icon name="down" size={16} />
                    </button>
                    <button className="icon-btn sm" onClick={() => setSection(s.id, { items: s.items.filter((_, k) => k !== ii) })} title="Remove">
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                  <textarea
                    rows={1}
                    value={it.notes}
                    placeholder="Talking point shown under the clip"
                    onChange={(e) => setSection(s.id, { items: s.items.map((x, k) => (k === ii ? { ...x, notes: e.target.value } : x)) })}
                  />
                </li>
              );
            })}
          </ul>
          <button className="btn sm" onClick={() => setPicker(s.id)}>
            <Icon name="plus" size={14} /> Add clips
          </button>
        </section>
      ))}
      <datalist id="pres-objectives">
        {objectives.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      <button className="btn ghost wide" onClick={() => setP({ ...p, sections: [...p.sections, { id: uid(), objective: '', items: [] }] })}>
        <Icon name="plus" /> Add tactical objective
      </button>

      {picker && (
        <ClipPicker
          clips={clips}
          matches={matchById}
          already={new Set(p.sections.flatMap((s) => s.items.map((i) => i.clipId)))}
          objective={p.sections.find((s) => s.id === picker)?.objective ?? ''}
          onClose={() => setPicker(null)}
          onAdd={(chosen) => {
            const sec = p.sections.find((s) => s.id === picker)!;
            setSection(picker, { items: [...sec.items, ...chosen.map((c) => ({ clipId: c.id, notes: c.teachingPoint }))] });
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}

function ClipPicker({ clips, matches, already, objective, onClose, onAdd }: { clips: Clip[]; matches: Map<number, { title: string }>; already: Set<number>; objective: string; onClose: () => void; onAdd: (c: Clip[]) => void }) {
  const [sel, setSel] = useState<number[]>([]);
  const [onlyObj, setOnlyObj] = useState(!!objective && clips.some((c) => c.objective === objective));
  const [q, setQ] = useState('');
  const list = clips
    .filter((c) => !already.has(c.id))
    .filter((c) => !onlyObj || c.objective === objective)
    .filter((c) => `${c.title} ${c.objective}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt);
  return (
    <Modal
      title="Add clips"
      wide
      onClose={onClose}
      footer={
        <button className="btn primary" disabled={!sel.length} onClick={() => onAdd(clips.filter((c) => sel.includes(c.id)))}>
          Add {sel.length || ''} clip{sel.length === 1 ? '' : 's'}
        </button>
      }
    >
      <div className="row gap-s wrap">
        <input className="grow" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        {objective && (
          <label className="check small">
            <input type="checkbox" checked={onlyObj} onChange={(e) => setOnlyObj(e.target.checked)} /> Only "{objective}"
          </label>
        )}
      </div>
      {!list.length && <p className="muted">No more clips to add. Create clips from a match first.</p>}
      <ul className="list">
        {list.map((c) => {
          const on = sel.includes(c.id);
          return (
            <li key={c.id}>
              <button className={`list-row ${on ? 'on' : ''}`} onClick={() => setSel(on ? sel.filter((x) => x !== c.id) : [...sel, c.id])}>
                <span className="checkbox">{on && <Icon name="check" size={14} />}</span>
                <span className="grow">
                  <b>{c.title}</b>
                  <span className="muted small block">
                    {matches.get(c.matchId)?.title} · {fmtTime(c.end - c.start)} {c.objective && `· ${c.objective}`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
