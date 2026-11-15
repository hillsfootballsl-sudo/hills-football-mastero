import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deletePlayer, type FeedbackKind, type Player, type Presentation } from '../db';
import Icon from '../components/Icon';
import BarList from '../components/BarList';
import { Empty, Modal, TagBadge, toast } from '../components/ui';
import { useTagTypes } from '../lib/hooks';
import { fmtDate, fmtTime } from '../lib/format';
import { PlayerForm } from './Squad';
import { FEEDBACK_KINDS } from './ClipEditor';
import { addClipsToPresentation } from '../components/AddToPresentation';

export default function PlayerProfile() {
  const { id } = useParams();
  const pid = Number(id);
  const nav = useNavigate();
  const player = useLiveQuery(() => db.players.get(pid).then((p) => p ?? null), [pid]);
  const events = useLiveQuery(() => db.events.where('playerIds').equals(pid).toArray(), [pid]) ?? [];
  const clips = useLiveQuery(() => db.clips.where('playerIds').equals(pid).toArray(), [pid]) ?? [];
  const feedback = useLiveQuery(() => db.feedback.where('playerId').equals(pid).reverse().sortBy('createdAt'), [pid]) ?? [];
  const matches = useLiveQuery(() => db.matches.orderBy('date').reverse().toArray()) ?? [];
  const tagTypes = useTagTypes();
  const [edit, setEdit] = useState<Partial<Player> | null>(null);
  const [kind, setKind] = useState<FeedbackKind>('strength');
  const [text, setText] = useState('');
  const [fbMatch, setFbMatch] = useState<number | ''>('');

  if (player === undefined) return <div className="page" />;
  if (player === null) return <Empty icon="user" title="Player not found" />;

  const ours = events.filter((e) => e.team === 'us');
  const byType = tagTypes
    .map((t) => ({ key: t.id, label: t.name, dot: t.color, value: ours.filter((e) => e.tagTypeId === t.id).length }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const perMatch = matches
    .map((m) => ({ m, n: ours.filter((e) => e.matchId === m.id).length, c: clips.filter((c) => c.matchId === m.id).length }))
    .filter((r) => r.n || r.c);

  const report = () =>
    [
      `${player.name}${player.number !== undefined ? ` #${player.number}` : ''}: feedback`,
      '',
      ...FEEDBACK_KINDS.flatMap((k) => {
        const items = feedback.filter((f) => f.kind === k.id);
        return items.length ? [`${k.label}:`, ...items.map((f) => `• ${f.text}`), ''] : [];
      }),
      byType.length ? `Involvements: ${byType.map((d) => `${d.label} ${d.value}`).join(', ')}` : '',
      '',
      'Hills Football Mastero',
    ].join('\n');

  const individualReview = async () => {
    if (!clips.length) return;
    const now = Date.now();
    const newId = (await db.presentations.add({ title: `${player.name}: individual review`, audience: player.name, summary: feedback.find((f) => f.kind === 'focus')?.text ?? '', sections: [], createdAt: now, updatedAt: now } as unknown as Presentation)) as number;
    await addClipsToPresentation((await db.presentations.get(newId))!, clips);
    nav(`/presentations/${newId}`);
  };

  return (
    <div className="page">
      <div className="analyze-head">
        <div>
          <Link to="/squad" className="link small">
            <Icon name="left" size={14} /> Squad
          </Link>
          <h1 className="player-title">
            {player.number !== undefined && <span className="shirt">{player.number}</span>}
            {player.name}
            {player.position && <span className="pill">{player.position}</span>}
            {!player.active && <span className="pill warn">inactive</span>}
          </h1>
        </div>
        <div className="row gap-s wrap">
          <button className="btn" onClick={individualReview} disabled={!clips.length}>
            <Icon name="present" /> Individual review
          </button>
          <button className="btn" onClick={() => setEdit({ ...player })}>
            <Icon name="edit" /> Edit
          </button>
        </div>
      </div>

      <section className="stat-row">
        {[
          ['Hills events', ours.length],
          ['Clips', clips.length],
          ['Matches involved', perMatch.length],
          ['Feedback notes', feedback.length],
        ].map(([l, n]) => (
          <div key={l} className="stat">
            <div className="stat-n">{n}</div>
            <div className="stat-l">{l}</div>
          </div>
        ))}
      </section>

      <div className="squad-layout">
        <section className="panel">
          <h3>Involvements by event</h3>
          <BarList data={byType} />
          {perMatch.length > 0 && (
            <>
              <h3>By match</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th>Date</th>
                      <th className="num">Events</th>
                      <th className="num">Clips</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perMatch.map(({ m, n, c }) => (
                      <tr key={m.id} className="clickable" onClick={() => nav(`/matches/${m.id}`)}>
                        <td>{m.title}</td>
                        <td className="muted">{fmtDate(m.date)}</td>
                        <td className="num mono">{n}</td>
                        <td className="num mono">{c}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="panel stack">
          <div className="row between">
            <h3>Feedback</h3>
            {feedback.length > 0 && (
              <button
                className="btn sm"
                onClick={async () => {
                  try {
                    if (navigator.share) await navigator.share({ title: `${player.name} feedback`, text: report() });
                    else {
                      await navigator.clipboard.writeText(report());
                      toast('Feedback report copied');
                    }
                  } catch {
                    /* cancelled */
                  }
                }}
              >
                <Icon name="share" size={14} /> Share report
              </button>
            )}
          </div>
          <div className="seg-toggle">
            {FEEDBACK_KINDS.map((k) => (
              <button key={k.id} className={kind === k.id ? 'active' : ''} onClick={() => setKind(k.id)}>
                <Icon name={k.icon} size={14} /> {k.label}
              </button>
            ))}
          </div>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Clear, specific and actionable…" />
          <div className="row gap-s">
            <select className="grow" value={fbMatch} onChange={(e) => setFbMatch(e.target.value ? Number(e.target.value) : '')}>
              <option value="">General (no match)</option>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
            <button
              className="btn primary"
              disabled={!text.trim()}
              onClick={async () => {
                await db.feedback.add({ playerId: pid, kind, text: text.trim(), matchId: fbMatch || undefined, createdAt: Date.now() } as never);
                setText('');
              }}
            >
              Add
            </button>
          </div>
          {FEEDBACK_KINDS.map((k) => {
            const items = feedback.filter((f) => f.kind === k.id);
            if (!items.length) return null;
            return (
              <div key={k.id}>
                <div className="label">
                  <Icon name={k.icon} size={14} /> {k.label}
                </div>
                {items.map((f) => (
                  <div key={f.id} className={`fb fb-${f.kind}`}>
                    <div className="row between">
                      <span className="muted small">
                        {new Date(f.createdAt).toLocaleDateString()}
                        {f.matchId && ` · ${matches.find((m) => m.id === f.matchId)?.title ?? ''}`}
                        {f.clipId && (
                          <>
                            {' · '}
                            <Link to={`/clips/${f.clipId}`} className="link">
                              clip
                            </Link>
                          </>
                        )}
                      </span>
                      <button className="icon-btn sm" onClick={() => db.feedback.delete(f.id)} aria-label="Delete feedback">
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                    <div>{f.text}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      </div>

      <section>
        <div className="section-head">
          <h2>Clips featuring {player.name.split(' ')[0]}</h2>
        </div>
        {clips.length ? (
          <ul className="list panel">
            {[...clips]
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((c) => (
                <li key={c.id}>
                  <Link to={`/clips/${c.id}`} className="list-row">
                    <span className="grow">
                      <b>{c.title}</b>
                      <span className="muted small block">
                        {matches.find((m) => m.id === c.matchId)?.title} · {fmtTime(c.end - c.start)} {c.objective && `· ${c.objective}`}
                      </span>
                    </span>
                    <TagBadge t={tagTypes.find((t) => t.id === c.tagTypeId)} />
                  </Link>
                </li>
              ))}
          </ul>
        ) : (
          <p className="muted">No clips tagged with this player yet.</p>
        )}
      </section>

      {edit && (
        <Modal
          title="Edit player"
          onClose={() => setEdit(null)}
          footer={
            <>
              <button
                className="btn danger"
                onClick={async () => {
                  if (!confirm(`Remove ${player.name}? Their feedback is deleted and they're removed from tags and clips.`)) return;
                  await deletePlayer(pid);
                  nav('/squad', { replace: true });
                }}
              >
                <Icon name="trash" size={16} /> Remove
              </button>
              <button
                className="btn primary"
                disabled={!edit.name?.trim()}
                onClick={async () => {
                  await db.players.update(pid, { name: edit.name!.trim(), number: edit.number, position: edit.position ?? '', active: edit.active ?? true });
                  setEdit(null);
                }}
              >
                Save
              </button>
            </>
          }
        >
          <PlayerForm value={edit} onChange={setEdit} />
        </Modal>
      )}
    </div>
  );
}
