import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteMatch, eventVideoTime, uid, type Clip, type Match, type Shape, type TagEvent, type TagType, type Team } from '../db';
import VideoPlayer, { type PlayerController, type PlayerSource } from '../components/VideoPlayer';
import { DrawingCanvas, DrawToolbar, DRAW_COLORS, type Tool } from '../components/Telestrator';
import ClipForm, { type ClipDraft } from '../components/ClipForm';
import Icon from '../components/Icon';
import { Empty, Modal, PlayerChips, TagBadge, TagDot, Timeline, Transport, isTyping, toast } from '../components/ui';
import { useMatchVideoUrl, usePlayers, useTagTypes } from '../lib/hooks';
import { fmtDate, fmtMatchClock, fmtTime } from '../lib/format';
import { MatchDetailsForm, SourcePicker, matchTitle, saveSource, type MatchDetails } from './NewMatch';

type Tab = 'tag' | 'events' | 'clips';

interface ClipModalState {
  start: number;
  end: number;
  eventId?: number;
  drawings: Clip['drawings'];
  draft: ClipDraft;
}

export function playerNames(ids: number[], players: { id: number; name: string; number?: number }[]) {
  return ids
    .map((id) => players.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => p!.name)
    .join(', ');
}

export default function Analyze() {
  const { id } = useParams();
  const matchId = Number(id);
  const nav = useNavigate();
  const match = useLiveQuery(() => db.matches.get(matchId).then((m) => m ?? null), [matchId]);
  const events = useLiveQuery(() => db.events.where('matchId').equals(matchId).toArray(), [matchId]) ?? [];
  const clips = useLiveQuery(() => db.clips.where('matchId').equals(matchId).toArray(), [matchId]) ?? [];
  const tagTypes = useTagTypes();
  const players = usePlayers().filter((p) => p.active);
  const videoUrl = useMatchVideoUrl(match);

  const [ctrl, setCtrl] = useState<PlayerController | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<Tab>('tag');
  const [team, setTeam] = useState<Team>('us');
  const [selPlayers, setSelPlayers] = useState<number[]>([]);
  const [sticky, setSticky] = useState(false);
  const [note, setNote] = useState('');
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [markOut, setMarkOut] = useState<number | null>(null);
  const [clipModal, setClipModal] = useState<ClipModalState | null>(null);
  const [drawOn, setDrawOn] = useState(false);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [width, setWidth] = useState(3);
  const [fTags, setFTags] = useState<number[]>([]);
  const [fPlayers, setFPlayers] = useState<number[]>([]);
  const [fTeam, setFTeam] = useState<'all' | Team>('all');
  const [editEvent, setEditEvent] = useState<TagEvent | null>(null);
  const [showSync, setShowSync] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [playRange, setPlayRange] = useState<{ start: number; end: number } | null>(null);
  const [lastEventId, setLastEventId] = useState<number | null>(null);

  const tagById = useMemo(() => new Map(tagTypes.map((t) => [t.id, t])), [tagTypes]);

  const source: PlayerSource | null =
    match?.source.kind === 'youtube' ? { kind: 'youtube', youtubeId: match.source.youtubeId } : videoUrl ? { kind: 'file', url: videoUrl } : null;

  // Events resolved to video time; live events from an unsynced half have vt = null.
  const resolved = useMemo(
    () =>
      events
        .map((e) => ({ e, vt: eventVideoTime(e, match) }))
        .sort((a, b) => (a.vt ?? 1e12) - (b.vt ?? 1e12) || a.e.half - b.e.half || a.e.time - b.e.time),
    [events, match],
  );
  const unsynced = resolved.filter((r) => r.vt === null).length;
  const hasLive = events.some((e) => e.mode === 'live');

  const filtered = resolved.filter(
    ({ e }) =>
      (!fTags.length || fTags.includes(e.tagTypeId)) &&
      (!fPlayers.length || e.playerIds.some((p) => fPlayers.includes(p))) &&
      (fTeam === 'all' || e.team === fTeam),
  );

  const onTime = (t: number) => {
    setTime(t);
    if (playRange && t >= playRange.end) {
      ctrl?.pause();
      setPlayRange(null);
    }
  };

  const seek = (t: number) => ctrl?.seek(t);

  const addTag = async (tt: TagType) => {
    if (!ctrl || !match) return;
    const t = ctrl.getTime();
    const k2 = match.kickoffs[2];
    const ev: Omit<TagEvent, 'id'> = {
      matchId,
      tagTypeId: tt.id,
      team,
      playerIds: selPlayers,
      note: note.trim(),
      mode: 'video',
      time: t,
      half: k2 !== undefined && t >= k2 ? 2 : 1,
      createdAt: Date.now(),
    };
    const newId = (await db.events.add(ev as TagEvent)) as number;
    setLastEventId(newId);
    if (!sticky) setSelPlayers([]);
    setNote('');
    toast(`${tt.name} tagged at ${fmtTime(t)}`);
  };

  const openClipFromEvent = (ev: TagEvent, vt: number) => {
    const tt = tagById.get(ev.tagTypeId);
    const names = playerNames(ev.playerIds, players);
    setClipModal({
      start: Math.max(0, vt - (tt?.preRoll ?? 6)),
      end: Math.min(duration || vt + 30, vt + (tt?.postRoll ?? 6)),
      eventId: ev.id,
      drawings: [],
      draft: { title: `${tt?.name ?? 'Moment'}${names ? ` – ${names}` : ''}`, tagTypeId: ev.tagTypeId, playerIds: ev.playerIds, objective: '', teachingPoint: ev.note },
    });
  };

  const openClipFromMarks = () => {
    if (markIn == null || markOut == null || markOut <= markIn) {
      toast('Set an In point (I) and an Out point (O) first');
      return;
    }
    setClipModal({ start: markIn, end: markOut, drawings: [], draft: { title: '', tagTypeId: undefined, playerIds: [], objective: '', teachingPoint: '' } });
  };

  const openClipWithDrawing = () => {
    if (!shapes.length) return;
    const t = ctrl?.getTime() ?? time;
    setClipModal({
      start: Math.max(0, t - 6),
      end: Math.min(duration || t + 4, t + 4),
      drawings: [{ id: uid(), time: t, hold: 4, shapes }],
      draft: { title: '', tagTypeId: undefined, playerIds: [], objective: '', teachingPoint: '' },
    });
  };

  const saveClip = async (open: boolean) => {
    if (!clipModal) return;
    const d = clipModal.draft;
    const clip: Omit<Clip, 'id'> = {
      matchId,
      start: clipModal.start,
      end: clipModal.end,
      eventId: clipModal.eventId,
      drawings: clipModal.drawings,
      title: d.title.trim() || `Clip ${fmtTime(clipModal.start)}`,
      tagTypeId: d.tagTypeId,
      playerIds: d.playerIds,
      objective: d.objective.trim(),
      teachingPoint: d.teachingPoint.trim(),
      createdAt: Date.now(),
    };
    const cid = (await db.clips.add(clip as Clip)) as number;
    setClipModal(null);
    setMarkIn(null);
    setMarkOut(null);
    if (clipModal.drawings.length) {
      setShapes([]);
      setDrawOn(false);
    }
    if (open) nav(`/clips/${cid}`);
    else toast('Clip saved');
  };

  const clipAllFiltered = async () => {
    const existing = new Set(clips.map((c) => c.eventId).filter(Boolean));
    const todo = filtered.filter((r) => r.vt !== null && !existing.has(r.e.id));
    if (!todo.length) {
      toast('Every shown event already has a clip');
      return;
    }
    if (!confirm(`Create ${todo.length} clip${todo.length > 1 ? 's' : ''} from the shown events using each tag's pre/post-roll?`)) return;
    const now = Date.now();
    await db.clips.bulkAdd(
      todo.map(({ e, vt }, i) => {
        const tt = tagById.get(e.tagTypeId);
        const names = playerNames(e.playerIds, players);
        return {
          matchId,
          start: Math.max(0, vt! - (tt?.preRoll ?? 6)),
          end: Math.min(duration || vt! + 30, vt! + (tt?.postRoll ?? 6)),
          eventId: e.id,
          drawings: [],
          title: `${tt?.name ?? 'Moment'}${names ? ` – ${names}` : ''} (${fmtTime(vt)})`,
          tagTypeId: e.tagTypeId,
          playerIds: e.playerIds,
          objective: '',
          teachingPoint: e.note,
          createdAt: now + i,
        } as unknown as Clip;
      }),
    );
    toast(`${todo.length} clips created`);
    setTab('clips');
  };

  const playClip = (c: Clip) => {
    ctrl?.seek(c.start);
    setPlayRange({ start: c.start, end: c.end });
    ctrl?.play();
  };

  // Keyboard shortcuts. A ref keeps the listener stable while reading the latest state.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (isTyping(e) || clipModal || editEvent || showSync || showDetails || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') {
      e.preventDefault();
      ctrl?.toggle();
    } else if (k === 'arrowleft') seek(time - (e.shiftKey ? 1 : 5));
    else if (k === 'arrowright') seek(time + (e.shiftKey ? 1 : 5));
    else if (k === ',') {
      ctrl?.pause();
      seek(time - 1 / 25);
    } else if (k === '.') {
      ctrl?.pause();
      seek(time + 1 / 25);
    } else if (k === 'i') setMarkIn(ctrl?.getTime() ?? time);
    else if (k === 'o') setMarkOut(ctrl?.getTime() ?? time);
    else if (k === 'enter') openClipFromMarks();
    else if (k === 'd') toggleDraw();
    else {
      const tt = tagTypes.find((t) => t.hotkey && t.hotkey.toLowerCase() === k);
      if (tt) {
        e.preventDefault();
        addTag(tt);
      }
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const toggleDraw = () => {
    if (!drawOn) ctrl?.pause();
    setDrawOn(!drawOn);
  };

  if (match === undefined) return <div className="page" />;
  if (match === null) return <Empty icon="film" title="Match not found" />;

  const markers = resolved
    .filter((r) => r.vt !== null)
    .map((r) => ({ id: r.e.id, t: r.vt!, color: tagById.get(r.e.tagTypeId)?.color ?? '#94a3b8', label: tagById.get(r.e.tagTypeId)?.name }));

  return (
    <div className="page analyze-page">
      <div className="analyze-head">
        <div>
          <Link to="/matches" className="link small">
            <Icon name="left" size={14} /> Matches
          </Link>
          <h1>
            {match.title}
            {match.scoreFor !== undefined && match.scoreAgainst !== undefined && (
              <span className="score lg">
                {match.scoreFor}–{match.scoreAgainst}
              </span>
            )}
          </h1>
          <div className="muted small">
            {fmtDate(match.date)} {match.competition && `· ${match.competition}`}
          </div>
        </div>
        <div className="row gap-s wrap">
          {hasLive && (
            <button className={`btn ${unsynced ? 'warn' : ''}`} onClick={() => setShowSync(true)}>
              <Icon name="sync" /> {unsynced ? `Sync ${unsynced} live tags` : 'Live sync'}
            </button>
          )}
          <Link to={`/live/${match.id}`} className="btn">
            <Icon name="zap" /> Live tag
          </Link>
          <button className="btn" onClick={() => setShowDetails(true)}>
            <Icon name="edit" /> Details
          </button>
        </div>
      </div>

      <div className="analyze">
        <div className="analyze-main">
          {source ? (
            <VideoPlayer
              source={source}
              onReady={setCtrl}
              onTime={onTime}
              onDuration={setDuration}
              onPlayingChange={setPlaying}
              tapToggle={!drawOn}
              overlay={(rect, stage) => drawOn && <DrawingCanvas rect={rect} stage={stage} shapes={shapes} onChange={setShapes} tool={tool} color={color} width={width} />}
            />
          ) : match.source.kind === 'none' ? (
            <AttachVideo match={match} />
          ) : (
            <div className="stage loading">Loading video…</div>
          )}

          {source && (
            <>
              <Timeline
                duration={duration}
                time={time}
                markers={markers}
                ranges={clips.map((c) => ({ start: c.start, end: c.end }))}
                markIn={markIn}
                markOut={markOut}
                onSeek={seek}
              />
              <Transport ctrl={ctrl} time={time} duration={duration} playing={playing}>
                <button className="btn sm" onClick={() => setMarkIn(time)} title="Mark In (I)">
                  <Icon name="markIn" size={16} /> In {markIn != null && <span className="mono">{fmtTime(markIn)}</span>}
                </button>
                <button className="btn sm" onClick={() => setMarkOut(time)} title="Mark Out (O)">
                  <Icon name="markOut" size={16} /> Out {markOut != null && <span className="mono">{fmtTime(markOut)}</span>}
                </button>
                <button className="btn sm primary" onClick={openClipFromMarks} disabled={markIn == null || markOut == null || markOut <= markIn} title="Create clip (Enter)">
                  <Icon name="scissors" size={16} /> Clip
                </button>
                <button className={`btn sm ${drawOn ? 'active' : ''}`} onClick={toggleDraw} title="Draw on video (D)">
                  <Icon name="pen" size={16} /> Draw
                </button>
              </Transport>
              {drawOn && (
                <DrawToolbar
                  tool={tool}
                  setTool={setTool}
                  color={color}
                  setColor={setColor}
                  width={width}
                  setWidth={setWidth}
                  onUndo={() => setShapes(shapes.slice(0, -1))}
                  onClear={() => setShapes([])}
                  canUndo={shapes.length > 0}
                  extra={
                    <button className="btn sm primary" disabled={!shapes.length} onClick={openClipWithDrawing}>
                      <Icon name="scissors" size={16} /> Save as clip
                    </button>
                  }
                />
              )}
              <p className="hint kbd-only">
                Shortcuts: <kbd>Space</kbd> play · <kbd>←</kbd>/<kbd>→</kbd> 5s · <kbd>,</kbd>/<kbd>.</kbd> frame · <kbd>I</kbd>/<kbd>O</kbd> mark · <kbd>Enter</kbd> clip · <kbd>D</kbd> draw · tag letters shown on buttons
              </p>
            </>
          )}
        </div>

        <aside className="analyze-side panel">
          <div className="tabs">
            <button className={tab === 'tag' ? 'active' : ''} onClick={() => setTab('tag')}>
              Tag
            </button>
            <button className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}>
              Events <span className="count">{events.length}</span>
            </button>
            <button className={tab === 'clips' ? 'active' : ''} onClick={() => setTab('clips')}>
              Clips <span className="count">{clips.length}</span>
            </button>
          </div>

          {tab === 'tag' && (
            <div className="stack">
              <div className="team-toggle">
                <button className={team === 'us' ? 'active' : ''} onClick={() => setTeam('us')}>
                  Hills
                </button>
                <button className={team === 'them' ? 'active them' : ''} onClick={() => setTeam('them')}>
                  {match.opponent || 'Opponent'}
                </button>
              </div>
              <div className="tag-grid">
                {tagTypes.map((t) => (
                  <button key={t.id} className="tag-btn" style={{ '--c': t.color } as React.CSSProperties} onClick={() => addTag(t)} disabled={!ctrl}>
                    <span>{t.name}</span>
                    {t.hotkey && <kbd>{t.hotkey.toUpperCase()}</kbd>}
                  </button>
                ))}
              </div>
              <div>
                <div className="row between">
                  <div className="label">Players for next tag</div>
                  <label className="check small">
                    <input type="checkbox" checked={sticky} onChange={(e) => setSticky(e.target.checked)} /> keep selected
                  </label>
                </div>
                <PlayerChips players={players} selected={selPlayers} onChange={setSelPlayers} compact />
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for next tag" />
              {lastEventId && (() => {
                const r = resolved.find((x) => x.e.id === lastEventId);
                if (!r) return null;
                return (
                  <div className="last-tag">
                    <TagBadge t={tagById.get(r.e.tagTypeId)} /> <span className="mono">{fmtTime(r.vt)}</span>
                    <div className="row gap-s">
                      <button className="btn sm" onClick={() => r.vt !== null && openClipFromEvent(r.e, r.vt)}>
                        <Icon name="scissors" size={14} /> Clip it
                      </button>
                      <button className="btn sm" onClick={() => setEditEvent(r.e)}>
                        <Icon name="edit" size={14} />
                      </button>
                      <button
                        className="btn sm"
                        onClick={async () => {
                          await db.events.delete(r.e.id);
                          setLastEventId(null);
                          toast('Tag removed');
                        }}
                      >
                        <Icon name="undo" size={14} /> Undo
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {tab === 'events' && (
            <div className="stack">
              <div className="filters">
                <div className="row gap-s wrap">
                  <Icon name="filter" size={16} />
                  {(['all', 'us', 'them'] as const).map((t) => (
                    <button key={t} className={`chip ${fTeam === t ? 'on' : ''}`} onClick={() => setFTeam(t)}>
                      {t === 'all' ? 'Both teams' : t === 'us' ? 'Hills' : match.opponent || 'Opponent'}
                    </button>
                  ))}
                </div>
                <div className="chips compact">
                  {tagTypes
                    .filter((t) => events.some((e) => e.tagTypeId === t.id))
                    .map((t) => {
                      const on = fTags.includes(t.id);
                      return (
                        <button key={t.id} className={`chip ${on ? 'on' : ''}`} onClick={() => setFTags(on ? fTags.filter((x) => x !== t.id) : [...fTags, t.id])}>
                          <TagDot t={t} /> {t.name} <span className="muted">{events.filter((e) => e.tagTypeId === t.id).length}</span>
                        </button>
                      );
                    })}
                </div>
                <PlayerChips players={players.filter((p) => events.some((e) => e.playerIds.includes(p.id)))} selected={fPlayers} onChange={setFPlayers} compact />
                <div className="row between">
                  <span className="muted small">
                    {filtered.length} of {events.length} events
                  </span>
                  <button className="btn sm" onClick={clipAllFiltered} disabled={!filtered.length}>
                    <Icon name="layers" size={14} /> Clip all shown
                  </button>
                </div>
              </div>
              {!events.length && <p className="muted">No tags yet. Use the Tag tab while the video plays.</p>}
              <ul className="event-list">
                {filtered.map(({ e, vt }) => {
                  const tt = tagById.get(e.tagTypeId);
                  const hasClip = clips.some((c) => c.eventId === e.id);
                  return (
                    <li key={e.id} className={`event-row ${e.team === 'them' ? 'them' : ''} ${vt !== null && Math.abs(vt - time) < 1 ? 'now' : ''}`}>
                      <button className="event-main" onClick={() => vt !== null && seek(Math.max(0, vt - (tt?.preRoll ?? 3)))} disabled={vt === null}>
                        <span className="mono time-cell">{vt !== null ? fmtTime(vt) : fmtMatchClock(e.time, e.half)}</span>
                        <TagDot t={tt} />
                        <span className="event-text">
                          <b>{tt?.name ?? 'Deleted tag'}</b>
                          {e.team === 'them' && <span className="pill sm">{match.opponent || 'Opp'}</span>}
                          {e.mode === 'live' && <span className={`pill sm ${vt === null ? 'warn' : ''}`}>{vt === null ? 'unsynced' : 'live'}</span>}
                          {hasClip && <Icon name="scissors" size={12} />}
                          <span className="muted small block">{[playerNames(e.playerIds, players), e.note].filter(Boolean).join(' · ')}</span>
                        </span>
                      </button>
                      <div className="row-actions">
                        <button className="icon-btn sm" title="Make clip" disabled={vt === null} onClick={() => vt !== null && openClipFromEvent(e, vt)}>
                          <Icon name="scissors" size={16} />
                        </button>
                        <button className="icon-btn sm" title="Edit" onClick={() => setEditEvent(e)}>
                          <Icon name="edit" size={16} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {tab === 'clips' && (
            <div className="stack">
              {!clips.length && <p className="muted">No clips yet. Mark In/Out, use "Clip it" on a tag, or draw and save.</p>}
              <ul className="event-list">
                {[...clips]
                  .sort((a, b) => a.start - b.start)
                  .map((c) => (
                    <li key={c.id} className="event-row">
                      <button className="event-main" onClick={() => playClip(c)}>
                        <span className="mono time-cell">{fmtTime(c.start)}</span>
                        <TagDot t={c.tagTypeId ? tagById.get(c.tagTypeId) : undefined} />
                        <span className="event-text">
                          <b>{c.title}</b>
                          {c.drawings.length > 0 && <Icon name="pen" size={12} />}
                          <span className="muted small block">
                            {fmtTime(c.end - c.start)} {c.objective && `· ${c.objective}`}
                          </span>
                        </span>
                      </button>
                      <div className="row-actions">
                        <Link className="icon-btn sm" title="Open in clip editor" to={`/clips/${c.id}`}>
                          <Icon name="edit" size={16} />
                        </Link>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {clipModal && (
        <Modal
          title="New teaching clip"
          onClose={() => setClipModal(null)}
          footer={
            <>
              <button className="btn" onClick={() => saveClip(true)}>
                Save & open editor
              </button>
              <button className="btn primary" onClick={() => saveClip(false)}>
                Save clip
              </button>
            </>
          }
        >
          <div className="clip-range">
            <label>
              Start
              <input type="number" step={0.5} value={clipModal.start.toFixed(1)} onChange={(e) => setClipModal({ ...clipModal, start: Math.max(0, Number(e.target.value)) })} />
            </label>
            <label>
              End
              <input type="number" step={0.5} value={clipModal.end.toFixed(1)} onChange={(e) => setClipModal({ ...clipModal, end: Number(e.target.value) })} />
            </label>
            <div className="muted small">
              {fmtTime(clipModal.start)} → {fmtTime(clipModal.end)} ({Math.max(0, clipModal.end - clipModal.start).toFixed(1)}s)
              {clipModal.drawings.length > 0 && ' · includes your drawing as a freeze-frame'}
            </div>
          </div>
          <ClipForm value={clipModal.draft} onChange={(draft) => setClipModal({ ...clipModal, draft })} tagTypes={tagTypes} players={players} />
        </Modal>
      )}

      {editEvent && <EditEventModal ev={editEvent} tagTypes={tagTypes} players={players} opponent={match.opponent} onClose={() => setEditEvent(null)} />}
      {showSync && <SyncModal match={match} events={events} ctrl={ctrl} time={time} onClose={() => setShowSync(false)} />}
      {showDetails && <DetailsModal match={match} onClose={() => setShowDetails(false)} onDeleted={() => nav('/matches', { replace: true })} />}
    </div>
  );
}

function EditEventModal({ ev, tagTypes, players, opponent, onClose }: { ev: TagEvent; tagTypes: TagType[]; players: { id: number; name: string; number?: number; position: string; active: boolean; createdAt: number }[]; opponent: string; onClose: () => void }) {
  const [v, setV] = useState(ev);
  return (
    <Modal
      title="Edit tag"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn danger"
            onClick={async () => {
              await db.events.delete(ev.id);
              onClose();
            }}
          >
            <Icon name="trash" size={16} /> Delete
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              await db.events.put(v);
              onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid">
          <label>
            Event type
            <select value={v.tagTypeId} onChange={(e) => setV({ ...v, tagTypeId: Number(e.target.value) })}>
              {tagTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Team
            <select value={v.team} onChange={(e) => setV({ ...v, team: e.target.value as Team })}>
              <option value="us">Hills</option>
              <option value="them">{opponent || 'Opponent'}</option>
            </select>
          </label>
          <label>
            {v.mode === 'live' ? `Match clock (seconds into half ${v.half})` : 'Video time (seconds)'}
            <input type="number" step={0.5} value={Number(v.time.toFixed(1))} onChange={(e) => setV({ ...v, time: Math.max(0, Number(e.target.value)) })} />
          </label>
          {v.mode === 'live' && (
            <label>
              Half
              <select value={v.half} onChange={(e) => setV({ ...v, half: Number(e.target.value) as 1 | 2 })}>
                <option value={1}>1st half</option>
                <option value={2}>2nd half</option>
              </select>
            </label>
          )}
        </div>
        <label>
          Note
          <input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
        </label>
        <div>
          <div className="label">Players</div>
          <PlayerChips players={players as never} selected={v.playerIds} onChange={(ids) => setV({ ...v, playerIds: ids })} compact />
        </div>
      </div>
    </Modal>
  );
}

function SyncModal({ match, events, ctrl, time, onClose }: { match: Match; events: TagEvent[]; ctrl: PlayerController | null; time: number; onClose: () => void }) {
  const counts = { 1: events.filter((e) => e.mode === 'live' && e.half === 1).length, 2: events.filter((e) => e.mode === 'live' && e.half === 2).length };
  const setK = (half: 1 | 2, v: number | undefined) => db.matches.update(match.id, { kickoffs: { ...match.kickoffs, [half]: v } });
  return (
    <Modal title="Sync live tags to video" onClose={onClose}>
      <p className="muted">
        Live tags were logged against the match clock. To line them up with the footage, play the video to the <b>kick-off of each half</b> and press <b>Set</b>. You can keep the video moving behind this window.
      </p>
      <div className="row gap-s">
        <button className="icon-btn" onClick={() => ctrl?.seek(time - 5)}>
          <Icon name="back" />
        </button>
        <button className="icon-btn" onClick={() => ctrl?.toggle()}>
          <Icon name="play" />
        </button>
        <button className="icon-btn" onClick={() => ctrl?.seek(time + 5)}>
          <Icon name="fwd" />
        </button>
        <span className="mono">Video at {fmtTime(time, true)}</span>
      </div>
      {([1, 2] as const).map((h) => (
        <div key={h} className="sync-row">
          <div>
            <b>{h === 1 ? '1st' : '2nd'} half kick-off</b>
            <div className="muted small">
              {counts[h]} live tag{counts[h] === 1 ? '' : 's'} · {match.kickoffs[h] !== undefined ? `synced at ${fmtTime(match.kickoffs[h]!, true)}` : 'not synced'}
            </div>
          </div>
          <div className="row gap-s">
            {match.kickoffs[h] !== undefined && (
              <>
                <button className="btn sm" onClick={() => setK(h, Math.max(0, match.kickoffs[h]! - 1))}>
                  −1s
                </button>
                <button className="btn sm" onClick={() => setK(h, match.kickoffs[h]! + 1)}>
                  +1s
                </button>
              </>
            )}
            <button className="btn sm primary" onClick={() => setK(h, ctrl?.getTime() ?? time)}>
              Set to {fmtTime(time)}
            </button>
          </div>
        </div>
      ))}
    </Modal>
  );
}

function DetailsModal({ match, onClose, onDeleted }: { match: Match; onClose: () => void; onDeleted: () => void }) {
  const [d, setD] = useState<MatchDetails>({ title: match.title, opponent: match.opponent, date: match.date, competition: match.competition, venue: match.venue, scoreFor: match.scoreFor, scoreAgainst: match.scoreAgainst });
  const [replace, setReplace] = useState(false);
  return (
    <Modal
      title="Match details"
      wide
      onClose={onClose}
      footer={
        <>
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm('Delete this match, its video, tags and clips? This cannot be undone.')) return;
              await deleteMatch(match.id);
              onDeleted();
            }}
          >
            <Icon name="trash" size={16} /> Delete match
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              await db.matches.update(match.id, { ...d, title: matchTitle(d) });
              onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <MatchDetailsForm value={d} onChange={setD} />
      <div className="panel inset">
        <div className="row between">
          <div>
            <b>Footage</b>
            <div className="muted small">
              {match.source.kind === 'file' ? `Video file ${match.source.fileName ?? ''}` : match.source.kind === 'youtube' ? match.source.url : 'No video attached'}
            </div>
          </div>
          <button className="btn sm" onClick={() => setReplace(!replace)}>
            {match.source.kind === 'none' ? 'Attach video' : 'Replace video'}
          </button>
        </div>
        {replace && <AttachVideo match={match} onDone={() => setReplace(false)} />}
      </div>
    </Modal>
  );
}

function AttachVideo({ match, onDone }: { match: Match; onDone?: () => void }) {
  const [mode, setMode] = useState<'upload' | 'youtube' | 'none'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [yt, setYt] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="attach panel">
      <h3>Attach match footage</h3>
      <p className="muted small">Add the video for this match. Live tags will then line up once you sync kick-off times.</p>
      <SourcePicker mode={mode} setMode={setMode} file={file} setFile={setFile} yt={yt} setYt={setYt} allowNone={false} />
      <div className="row end">
        <button
          className="btn primary"
          disabled={busy || (mode === 'upload' ? !file : !yt)}
          onClick={async () => {
            setBusy(true);
            try {
              const source = await saveSource(mode, file, yt);
              if (source.kind === 'none') throw new Error('Choose a file or a valid YouTube link');
              if (match.source.kind === 'file') await db.videos.delete(match.source.videoId);
              await db.matches.update(match.id, { source });
              onDone?.();
            } catch (e) {
              toast(e instanceof Error ? e.message : String(e));
            }
            setBusy(false);
          }}
        >
          {busy ? 'Saving…' : 'Attach'}
        </button>
      </div>
    </div>
  );
}
