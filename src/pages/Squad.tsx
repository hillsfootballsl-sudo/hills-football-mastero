import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Player } from '../db';
import Icon from '../components/Icon';
import BarList from '../components/BarList';
import { Empty, Modal, PageHead, toast } from '../components/ui';
import { usePlayers, useTagTypes } from '../lib/hooks';

export const POSITIONS = ['GK', 'RB', 'CB', 'LB', 'RWB', 'LWB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST', ''];

export function PlayerForm({ value, onChange }: { value: Partial<Player>; onChange: (p: Partial<Player>) => void }) {
  return (
    <div className="form-grid">
      <label className="span-2">
        Name
        <input value={value.name ?? ''} onChange={(e) => onChange({ ...value, name: e.target.value })} autoFocus />
      </label>
      <label>
        Shirt number
        <input type="number" min={0} inputMode="numeric" value={value.number ?? ''} onChange={(e) => onChange({ ...value, number: e.target.value === '' ? undefined : Number(e.target.value) })} />
      </label>
      <label>
        Position
        <select value={value.position ?? ''} onChange={(e) => onChange({ ...value, position: e.target.value })}>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p || '—'}
            </option>
          ))}
        </select>
      </label>
      <label className="check span-2">
        <input type="checkbox" checked={value.active ?? true} onChange={(e) => onChange({ ...value, active: e.target.checked })} /> Active in squad (shown when tagging)
      </label>
    </div>
  );
}

/** "7 Sam Jones CM" → { number: 7, name: 'Sam Jones', position: 'CM' } */
function parseLine(line: string): Partial<Player> | null {
  let s = line.trim().replace(/[,\t;]+/g, ' ').replace(/\s+/g, ' ');
  if (!s) return null;
  let number: number | undefined;
  const n = s.match(/^#?(\d{1,3})[.)]?\s+/);
  if (n) {
    number = Number(n[1]);
    s = s.slice(n[0].length);
  }
  let position = '';
  const pos = s.match(/\s([A-Za-z]{2,3})$/);
  if (pos && POSITIONS.includes(pos[1].toUpperCase())) {
    position = pos[1].toUpperCase();
    s = s.slice(0, -pos[0].length);
  }
  return s ? { name: s, number, position } : null;
}

export default function Squad() {
  const nav = useNavigate();
  const players = usePlayers();
  const tagTypes = useTagTypes();
  const events = useLiveQuery(() => db.events.toArray()) ?? [];
  const clips = useLiveQuery(() => db.clips.toArray()) ?? [];
  const feedback = useLiveQuery(() => db.feedback.toArray()) ?? [];
  const [adding, setAdding] = useState<Partial<Player> | null>(null);
  const [bulk, setBulk] = useState<string | null>(null);
  const [rankBy, setRankBy] = useState<number | 'all'>('all');
  const [showInactive, setShowInactive] = useState(false);

  const ours = events.filter((e) => e.team === 'us');
  const stats = useMemo(() => {
    const m = new Map<number, { tags: number; byType: Map<number, number>; clips: number; fb: number }>();
    for (const p of players) m.set(p.id, { tags: 0, byType: new Map(), clips: 0, fb: 0 });
    for (const e of ours)
      for (const pid of e.playerIds) {
        const s = m.get(pid);
        if (!s) continue;
        s.tags++;
        s.byType.set(e.tagTypeId, (s.byType.get(e.tagTypeId) ?? 0) + 1);
      }
    for (const c of clips) for (const pid of c.playerIds) if (m.get(pid)) m.get(pid)!.clips++;
    for (const f of feedback) if (m.get(f.playerId)) m.get(f.playerId)!.fb++;
    return m;
  }, [players, ours, clips, feedback]);

  const shown = players.filter((p) => showInactive || p.active);
  const ranking = shown
    .map((p) => ({ key: p.id, label: `${p.number !== undefined ? p.number + '. ' : ''}${p.name}`, value: rankBy === 'all' ? stats.get(p.id)?.tags ?? 0 : stats.get(p.id)?.byType.get(rankBy) ?? 0 }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  const save = async () => {
    if (!adding?.name?.trim()) return;
    await db.players.add({ name: adding.name.trim(), number: adding.number, position: adding.position ?? '', active: adding.active ?? true, createdAt: Date.now() } as Player);
    setAdding(null);
  };

  const saveBulk = async () => {
    const rows = (bulk ?? '').split('\n').map(parseLine).filter(Boolean) as Partial<Player>[];
    await db.players.bulkAdd(rows.map((r, i) => ({ name: r.name!, number: r.number, position: r.position ?? '', active: true, createdAt: Date.now() + i }) as Player));
    toast(`${rows.length} players added`);
    setBulk(null);
  };

  return (
    <div className="page">
      <PageHead title="Squad" kicker="Players & stats">
        <button className="btn" onClick={() => setBulk('')}>
          <Icon name="copy" /> Paste list
        </button>
        <button className="btn primary" onClick={() => setAdding({ active: true, position: '' })}>
          <Icon name="plus" /> Add player
        </button>
      </PageHead>

      {players.length === 0 ? (
        <Empty icon="users" title="Add your squad">
          <p>Players let you tag who was involved, filter footage by player, and track individual stats and feedback.</p>
          <div className="row gap center">
            <button className="btn" onClick={() => setBulk('')}>
              Paste a list
            </button>
            <button className="btn primary" onClick={() => setAdding({ active: true, position: '' })}>
              Add a player
            </button>
          </div>
        </Empty>
      ) : (
        <div className="squad-layout">
          <section className="panel">
            <div className="row between">
              <h3>Players ({shown.length})</h3>
              <label className="check small">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> show inactive
              </label>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Player</th>
                    <th>Pos</th>
                    <th className="num">Tags</th>
                    <th className="num">Clips</th>
                    <th className="num">Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => {
                    const s = stats.get(p.id);
                    return (
                      <tr key={p.id} className={`clickable ${p.active ? '' : 'inactive'}`} onClick={() => nav(`/squad/${p.id}`)}>
                        <td className="mono">{p.number ?? ''}</td>
                        <td>
                          <Link to={`/squad/${p.id}`}>{p.name}</Link>
                        </td>
                        <td className="muted">{p.position}</td>
                        <td className="num mono">{s?.tags ?? 0}</td>
                        <td className="num mono">{s?.clips ?? 0}</td>
                        <td className="num mono">{s?.fb ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <div className="row between wrap gap-s">
              <h3>Most involved</h3>
              <select value={rankBy} onChange={(e) => setRankBy(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="Rank by event type">
                <option value="all">All Hills events</option>
                {tagTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <BarList data={ranking} onSelect={(d) => nav(`/squad/${d.key}`)} />
            {!ranking.length && <p className="muted small">Tag players on Hills events to see who's most involved.</p>}
          </section>
        </div>
      )}

      {adding && (
        <Modal
          title="Add player"
          onClose={() => setAdding(null)}
          footer={
            <button className="btn primary" onClick={save} disabled={!adding.name?.trim()}>
              Add player
            </button>
          }
        >
          <PlayerForm value={adding} onChange={setAdding} />
        </Modal>
      )}
      {bulk !== null && (
        <Modal
          title="Paste squad list"
          onClose={() => setBulk(null)}
          footer={
            <button className="btn primary" onClick={saveBulk} disabled={!bulk.trim()}>
              Add {bulk.split('\n').map(parseLine).filter(Boolean).length} players
            </button>
          }
        >
          <p className="muted small">One player per line: number, name, then an optional position. For example:</p>
          <pre className="example">{'1 Alex Morgan GK\n4 Jamie Reid CB\n10 Sam Okafor AM'}</pre>
          <textarea rows={10} value={bulk} onChange={(e) => setBulk(e.target.value)} autoFocus />
        </Modal>
      )}
    </div>
  );
}
