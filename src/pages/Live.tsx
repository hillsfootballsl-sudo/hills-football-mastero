import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Match, type TagEvent, type TagType, type Team } from '../db';
import Icon from '../components/Icon';
import { Empty, PageHead, PlayerChips, TagDot, toast } from '../components/ui';
import { useLocalStorage, usePlayers, useTagTypes } from '../lib/hooks';
import { fmtDate, fmtMatchClock, todayISO } from '../lib/format';
import { playerNames } from './Analyze';

interface ClockState {
  half: 1 | 2;
  running: boolean;
  startedAt: number; // epoch ms when last started
  elapsed: number; // seconds accumulated before startedAt
}

const freshClock = (half: 1 | 2 = 1): ClockState => ({ half, running: false, startedAt: 0, elapsed: 0 });

function clockNow(c: ClockState) {
  return c.elapsed + (c.running ? (Date.now() - c.startedAt) / 1000 : 0);
}

/** Keep the screen awake while live tagging or recording. */
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => (lock = l))
        .catch(() => {});
    acquire();
    const vis = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

export default function Live() {
  const { id } = useParams();
  return id ? <LiveSession key={id} matchId={Number(id)} /> : <LivePicker />;
}

function LivePicker() {
  const nav = useNavigate();
  const [opponent, setOpponent] = useState('');
  const [competition, setCompetition] = useState('');
  const recent = useLiveQuery(() => db.matches.orderBy('createdAt').reverse().limit(8).toArray()) ?? [];
  const start = async () => {
    const title = opponent.trim() ? `Hills vs ${opponent.trim()}` : `Match ${todayISO()}`;
    const mid = (await db.matches.add({
      title,
      opponent: opponent.trim(),
      date: todayISO(),
      competition: competition.trim(),
      venue: 'home',
      scoreFor: 0,
      scoreAgainst: 0,
      source: { kind: 'none' },
      kickoffs: {},
      createdAt: Date.now(),
    } as Match)) as number;
    nav(`/live/${mid}`);
  };
  return (
    <div className="page narrow">
      <PageHead title="Live tagging" kicker="Touchline mode" />
      <p className="muted">
        Log key moments as they happen with big touch-friendly buttons. Each tag is stamped with the match clock. When the footage arrives, attach it and sync the kick-off, and every tag lines up with the video.
      </p>
      <section className="panel">
        <h3>Start a new match</h3>
        <div className="form-grid">
          <label>
            Opponent
            <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="e.g. Riverside FC" />
          </label>
          <label>
            Competition
            <input value={competition} onChange={(e) => setCompetition(e.target.value)} placeholder="League, Cup…" />
          </label>
        </div>
        <div className="row end">
          <button className="btn primary lg" onClick={start}>
            <Icon name="zap" /> Start live tagging
          </button>
        </div>
      </section>
      {recent.length > 0 && (
        <section className="panel">
          <h3>Or continue an existing match</h3>
          <ul className="list">
            {recent.map((m) => (
              <li key={m.id}>
                <Link to={`/live/${m.id}`} className="list-row">
                  <span>
                    <b>{m.title}</b> <span className="muted small">{fmtDate(m.date)}</span>
                  </span>
                  <Icon name="right" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function LiveSession({ matchId }: { matchId: number }) {
  useWakeLock();
  const match = useLiveQuery(() => db.matches.get(matchId).then((m) => m ?? null), [matchId]);
  const events = useLiveQuery(() => db.events.where('matchId').equals(matchId).reverse().sortBy('createdAt'), [matchId]) ?? [];
  const tagTypes = useTagTypes();
  const players = usePlayers().filter((p) => p.active);
  const [clock, setClock] = useLocalStorage<ClockState>(`live-clock-${matchId}`, freshClock());
  const [now, setNow] = useState(0);
  const [team, setTeam] = useState<Team>('us');
  const [sel, setSel] = useState<number[]>([]);
  const [flash, setFlash] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(clockNow(clock)), 250);
    setNow(clockNow(clock));
    return () => clearInterval(t);
  }, [clock]);

  if (match === undefined) return <div className="page" />;
  if (match === null) return <Empty icon="zap" title="Match not found" />;

  const toggle = () => {
    if (clock.running) setClock({ ...clock, running: false, elapsed: clockNow(clock) });
    else setClock({ ...clock, running: true, startedAt: Date.now() });
  };
  const adjust = (d: number) => setClock({ ...clock, elapsed: Math.max(0, clock.elapsed + d) });
  const goHalf = (h: 1 | 2) => {
    if (h === clock.half) return;
    if (!confirm(h === 2 ? 'Start the 2nd half? The clock resets to 45:00.' : 'Go back to the 1st half clock?')) return;
    setClock(freshClock(h));
  };

  const tag = async (tt: TagType) => {
    const t = clockNow(clock);
    const ev: Omit<TagEvent, 'id'> = { matchId, tagTypeId: tt.id, team, playerIds: sel, note: '', mode: 'live', time: t, half: clock.half, createdAt: Date.now() };
    await db.events.add(ev as TagEvent);
    if (tt.name.toLowerCase() === 'goal') {
      const key = team === 'us' ? 'scoreFor' : 'scoreAgainst';
      await db.matches.update(matchId, { [key]: (match[key] ?? 0) + 1 });
    }
    setSel([]);
    setFlash(tt.id);
    setTimeout(() => setFlash(null), 350);
    navigator.vibrate?.(30);
  };

  const remove = async (e: TagEvent) => {
    await db.events.delete(e.id);
    const tt = tagTypes.find((t) => t.id === e.tagTypeId);
    if (tt?.name.toLowerCase() === 'goal') {
      const key = e.team === 'us' ? 'scoreFor' : 'scoreAgainst';
      await db.matches.update(matchId, { [key]: Math.max(0, (match[key] ?? 0) - 1) });
    }
    toast('Tag removed');
  };

  const score = (k: 'scoreFor' | 'scoreAgainst', d: number) => db.matches.update(matchId, { [k]: Math.max(0, (match[k] ?? 0) + d) });

  return (
    <div className="page live-page">
      <div className="live-top">
        <div className="scoreboard">
          <div className="sb-team">
            <span>Hills</span>
            <div className="sb-score">
              <button onClick={() => score('scoreFor', -1)} aria-label="Hills goal minus">
                −
              </button>
              <b>{match.scoreFor ?? 0}</b>
              <button onClick={() => score('scoreFor', 1)} aria-label="Hills goal plus">
                +
              </button>
            </div>
          </div>
          <div className="sb-clock">
            <div className={`clock mono ${clock.running ? 'running' : ''}`}>{fmtMatchClock(now, clock.half)}</div>
            <div className="row gap-s center">
              <button className="btn sm" onClick={() => adjust(-10)}>
                −10s
              </button>
              <button className={`btn ${clock.running ? '' : 'primary'}`} onClick={toggle}>
                <Icon name={clock.running ? 'pause' : 'play'} size={16} /> {clock.running ? 'Pause' : now > 0 ? 'Resume' : 'Kick-off'}
              </button>
              <button className="btn sm" onClick={() => adjust(10)}>
                +10s
              </button>
            </div>
            <div className="seg-toggle">
              <button className={clock.half === 1 ? 'active' : ''} onClick={() => goHalf(1)}>
                1st half
              </button>
              <button className={clock.half === 2 ? 'active' : ''} onClick={() => goHalf(2)}>
                2nd half
              </button>
            </div>
          </div>
          <div className="sb-team right">
            <span>{match.opponent || 'Opponent'}</span>
            <div className="sb-score">
              <button onClick={() => score('scoreAgainst', -1)} aria-label="Opponent goal minus">
                −
              </button>
              <b>{match.scoreAgainst ?? 0}</b>
              <button onClick={() => score('scoreAgainst', 1)} aria-label="Opponent goal plus">
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="live-grid">
        <div className="stack">
          <div className="team-toggle big">
            <button className={team === 'us' ? 'active' : ''} onClick={() => setTeam('us')}>
              Hills
            </button>
            <button className={team === 'them' ? 'active them' : ''} onClick={() => setTeam('them')}>
              {match.opponent || 'Opponent'}
            </button>
          </div>
          <div className="live-tags">
            {tagTypes.map((t) => (
              <button key={t.id} className={`live-tag ${flash === t.id ? 'flash' : ''}`} style={{ '--c': t.color } as React.CSSProperties} onClick={() => tag(t)}>
                {t.name}
              </button>
            ))}
          </div>
          <div>
            <div className="label">Tap players first (optional)</div>
            <PlayerChips players={players} selected={sel} onChange={setSel} />
          </div>
        </div>

        <aside className="panel live-log">
          <div className="row between">
            <h3>Log ({events.length})</h3>
            <Link to={`/matches/${matchId}`} className="btn sm">
              <Icon name="film" size={14} /> {match.source.kind === 'none' ? 'Attach video & sync' : 'Analyse'}
            </Link>
          </div>
          {!events.length && <p className="muted small">Start the clock at kick-off, then tap a moment the instant it happens.</p>}
          <ul className="event-list">
            {events.map((e) => {
              const tt = tagTypes.find((t) => t.id === e.tagTypeId);
              return (
                <li key={e.id} className={`event-row ${e.team === 'them' ? 'them' : ''}`}>
                  <div className="event-main">
                    <span className="mono time-cell">{e.mode === 'live' ? fmtMatchClock(e.time, e.half) : '—'}</span>
                    <TagDot t={tt} />
                    <span className="event-text">
                      <b>{tt?.name}</b> {e.team === 'them' && <span className="pill sm">{match.opponent || 'Opp'}</span>}
                      <span className="muted small block">{playerNames(e.playerIds, players)}</span>
                    </span>
                  </div>
                  <button className="icon-btn sm" onClick={() => remove(e)} aria-label="Delete tag">
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
