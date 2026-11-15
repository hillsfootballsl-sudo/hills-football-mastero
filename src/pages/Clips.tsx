import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Clip } from '../db';
import Icon from '../components/Icon';
import AddToPresentation from '../components/AddToPresentation';
import { Empty, PageHead, PlayerChips, TagBadge } from '../components/ui';
import { usePlayers, useTagTypes } from '../lib/hooks';
import { fmtTime } from '../lib/format';
import { playerNames } from './Analyze';

export default function Clips() {
  const clips = useLiveQuery(() => db.clips.orderBy('createdAt').reverse().toArray()) ?? [];
  const matches = useLiveQuery(() => db.matches.toArray()) ?? [];
  const tagTypes = useTagTypes();
  const players = usePlayers();
  const [q, setQ] = useState('');
  const [fMatch, setFMatch] = useState<number | ''>('');
  const [fTag, setFTag] = useState<number | ''>('');
  const [fObj, setFObj] = useState('');
  const [fPlayers, setFPlayers] = useState<number[]>([]);
  const [sel, setSel] = useState<number[]>([]);
  const [adding, setAdding] = useState<Clip[] | null>(null);

  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const tagById = useMemo(() => new Map(tagTypes.map((t) => [t.id, t])), [tagTypes]);
  const objectives = Array.from(new Set(clips.map((c) => c.objective).filter(Boolean))).sort();

  const shown = clips.filter(
    (c) =>
      (!fMatch || c.matchId === fMatch) &&
      (!fTag || c.tagTypeId === fTag) &&
      (!fObj || c.objective === fObj) &&
      (!fPlayers.length || c.playerIds.some((p) => fPlayers.includes(p))) &&
      `${c.title} ${c.teachingPoint} ${c.objective}`.toLowerCase().includes(q.toLowerCase()),
  );

  const toggle = (id: number) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);

  return (
    <div className="page">
      <PageHead title="Clips" kicker="Step 2 · Insight">
        {sel.length > 0 && (
          <>
            <button className="btn" onClick={() => setSel([])}>
              Clear ({sel.length})
            </button>
            <button className="btn primary" onClick={() => setAdding(clips.filter((c) => sel.includes(c.id)))}>
              <Icon name="present" /> Add {sel.length} to presentation
            </button>
          </>
        )}
      </PageHead>

      {clips.length === 0 ? (
        <Empty icon="scissors" title="No clips yet">
          <p>Open a match, tag moments, then trim them into focused teaching clips.</p>
          <Link to="/matches" className="btn primary">
            Go to matches
          </Link>
        </Empty>
      ) : (
        <>
          <div className="filter-bar">
            <div className="search">
              <Icon name="search" size={18} />
              <input placeholder="Search clips" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select value={fMatch} onChange={(e) => setFMatch(e.target.value ? Number(e.target.value) : '')}>
              <option value="">All matches</option>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
            <select value={fTag} onChange={(e) => setFTag(e.target.value ? Number(e.target.value) : '')}>
              <option value="">All events</option>
              {tagTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select value={fObj} onChange={(e) => setFObj(e.target.value)}>
              <option value="">All objectives</option>
              {objectives.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <PlayerChips players={players.filter((p) => clips.some((c) => c.playerIds.includes(p.id)))} selected={fPlayers} onChange={setFPlayers} compact />
          <div className="row between">
            <span className="muted small">
              {shown.length} clip{shown.length === 1 ? '' : 's'}
            </span>
            {shown.length > 0 && (
              <button className="btn sm" onClick={() => setSel(Array.from(new Set([...sel, ...shown.map((c) => c.id)])))}>
                Select all shown
              </button>
            )}
          </div>
          <div className="grid cards">
            {shown.map((c) => {
              const m = matchById.get(c.matchId);
              const tt = c.tagTypeId ? tagById.get(c.tagTypeId) : undefined;
              const on = sel.includes(c.id);
              return (
                <div key={c.id} className={`clip-card ${on ? 'selected' : ''}`} style={{ '--c': tt?.color ?? '#5eb8ff' } as React.CSSProperties}>
                  <button className="clip-select" onClick={() => toggle(c.id)} aria-label={on ? 'Deselect' : 'Select'}>
                    {on && <Icon name="check" size={14} />}
                  </button>
                  <Link to={`/clips/${c.id}`} className="clip-body">
                    {m?.source.kind === 'youtube' ? (
                      <img className="clip-thumb" src={`https://i.ytimg.com/vi/${m.source.youtubeId}/mqdefault.jpg`} alt="" loading="lazy" />
                    ) : (
                      <div className="clip-thumb ph">
                        <Icon name="play" size={26} />
                      </div>
                    )}
                    <div className="clip-info">
                      <div className="row gap-s wrap">
                        <TagBadge t={tt} />
                        <span className="mono small muted">{fmtTime(c.end - c.start)}</span>
                        {c.drawings.length > 0 && (
                          <span className="small muted">
                            <Icon name="pen" size={12} /> {c.drawings.length}
                          </span>
                        )}
                      </div>
                      <b className="clip-title">{c.title}</b>
                      {c.objective && <div className="objective small">{c.objective}</div>}
                      <div className="muted small">{[m?.title, playerNames(c.playerIds, players)].filter(Boolean).join(' · ')}</div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </>
      )}
      {adding && (
        <AddToPresentation
          clips={adding}
          onClose={() => {
            setAdding(null);
            setSel([]);
          }}
        />
      )}
    </div>
  );
}
