import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteClip, uid, type Clip, type Drawing, type FeedbackKind, type Shape } from '../db';
import VideoPlayer, { type PlayerController, type PlayerSource } from '../components/VideoPlayer';
import { DrawingCanvas, DrawToolbar, DRAW_COLORS, type Tool } from '../components/Telestrator';
import ClipForm, { type ClipDraft } from '../components/ClipForm';
import AddToPresentation from '../components/AddToPresentation';
import Icon from '../components/Icon';
import { Empty, Timeline, Transport, isTyping, toast } from '../components/ui';
import { useMatchVideoUrl, usePlayers, useTagTypes } from '../lib/hooks';
import { useClipPlayback } from '../lib/clipPlayback';
import { fmtTime, slug } from '../lib/format';
import { canExport, downloadBlob, exportClip, shareFile } from '../lib/exportClip';
import { youtubeClipLink } from '../lib/youtube';

export const FEEDBACK_KINDS: { id: FeedbackKind; label: string; icon: string }[] = [
  { id: 'strength', label: 'Strength', icon: 'star' },
  { id: 'improve', label: 'To improve', icon: 'target' },
  { id: 'focus', label: 'Focus next', icon: 'key' },
];

export default function ClipEditor() {
  const { id } = useParams();
  const clipId = Number(id);
  const nav = useNavigate();
  const clip = useLiveQuery(() => db.clips.get(clipId).then((c) => c ?? null), [clipId]);
  const match = useLiveQuery(() => (clip ? db.matches.get(clip.matchId) : undefined), [clip?.matchId]);
  const videoUrl = useMatchVideoUrl(match);
  const tagTypes = useTagTypes();
  const players = usePlayers();

  const [ctrl, setCtrl] = useState<PlayerController | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [draft, setDraft] = useState<ClipDraft | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; time: number; hold: number; shapes: Shape[] } | null>(null);
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [width, setWidth] = useState(3);
  const [exporting, setExporting] = useState<number | null>(null);
  const [caption, setCaption] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const pb = useClipPlayback(ctrl, clip, { loop });

  useEffect(() => {
    if (clip && !draft) setDraft({ title: clip.title, tagTypeId: clip.tagTypeId, playerIds: clip.playerIds, objective: clip.objective, teachingPoint: clip.teachingPoint });
  }, [clip, draft]);

  // Autosave the details form.
  useEffect(() => {
    if (!draft || !clip) return;
    const t = setTimeout(() => db.clips.update(clip.id, { ...draft, title: draft.title.trim() || clip.title }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    if (isTyping(e) || !ctrl) return;
    if (e.key === ' ') {
      e.preventDefault();
      pb.clearFreeze();
      ctrl.toggle();
    } else if (e.key === ',') {
      ctrl.pause();
      ctrl.seek(time - 1 / 25);
    } else if (e.key === '.') {
      ctrl.pause();
      ctrl.seek(time + 1 / 25);
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (clip === undefined) return <div className="page" />;
  if (clip === null) return <Empty icon="scissors" title="Clip not found" />;

  const source: PlayerSource | null =
    match?.source.kind === 'youtube' ? { kind: 'youtube', youtubeId: match.source.youtubeId } : videoUrl ? { kind: 'file', url: videoUrl } : null;

  const setRange = (start: number, end: number) => {
    if (end - start < 0.5) return toast('A clip must be at least half a second long');
    db.clips.update(clip.id, { start: Math.max(0, start), end });
  };

  const startDrawing = () => {
    ctrl?.pause();
    pb.clearFreeze();
    setEditing({ id: null, time: ctrl?.getTime() ?? time, hold: 4, shapes: [] });
  };

  const saveDrawing = async () => {
    if (!editing) return;
    let drawings: Drawing[];
    if (editing.id) drawings = clip.drawings.map((d) => (d.id === editing.id ? { ...d, hold: editing.hold, shapes: editing.shapes } : d));
    else drawings = [...clip.drawings, { id: uid(), time: editing.time, hold: editing.hold, shapes: editing.shapes }];
    drawings.sort((a, b) => a.time - b.time);
    await db.clips.update(clip.id, { drawings });
    setEditing(null);
    toast('Drawing saved: playback will freeze here');
  };

  const doExport = async () => {
    if (!videoUrl) return;
    abort.current = new AbortController();
    setExporting(0);
    try {
      const blob = await exportClip(clip, videoUrl, { caption, onProgress: setExporting, signal: abort.current.signal });
      const name = `${slug(clip.title)}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
      const shared = await shareFile(blob, name, `${clip.title}${clip.teachingPoint ? ' – ' + clip.teachingPoint : ''}`);
      if (!shared) downloadBlob(blob, name);
      toast('Clip exported');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast(`Export failed: ${(e as Error).message}`);
    }
    setExporting(null);
  };

  const visibleShapes = editing?.shapes ?? pb.active?.shapes ?? (!playing ? clip.drawings.find((d) => Math.abs(d.time - time) < 0.08)?.shapes : undefined);
  const winMin = Math.max(0, clip.start - 20);
  const winMax = Math.min(duration || clip.end + 20, clip.end + 20);

  return (
    <div className="page analyze-page">
      <div className="analyze-head">
        <div>
          <Link to={match ? `/matches/${match.id}` : '/clips'} className="link small">
            <Icon name="left" size={14} /> {match?.title ?? 'Clips'}
          </Link>
          <h1>{draft?.title || clip.title}</h1>
          <div className="muted small">
            {fmtTime(clip.start)} → {fmtTime(clip.end)} · {(clip.end - clip.start).toFixed(1)}s · {clip.drawings.length} drawing{clip.drawings.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="row gap-s wrap">
          <button className="btn" onClick={() => setShowAdd(true)}>
            <Icon name="present" /> Add to presentation
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm('Delete this clip?')) return;
              await deleteClip(clip.id);
              nav(-1);
            }}
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>

      <div className="analyze">
        <div className="analyze-main">
          {source ? (
            <VideoPlayer
              source={source}
              startAt={clip.start}
              onReady={setCtrl}
              onTime={(t) => {
                setTime(t);
                if (!editing) pb.onTime(t);
              }}
              onDuration={setDuration}
              onPlayingChange={setPlaying}
              tapToggle={!editing}
              overlay={(rect, stage) =>
                visibleShapes && (
                  <DrawingCanvas
                    rect={rect}
                    stage={stage}
                    shapes={visibleShapes}
                    onChange={editing ? (shapes) => setEditing({ ...editing, shapes }) : undefined}
                    tool={tool}
                    color={color}
                    width={width}
                  />
                )
              }
            />
          ) : (
            <div className="stage loading">{match?.source.kind === 'none' ? 'This match has no video attached.' : 'Loading video…'}</div>
          )}
          <Timeline
            min={winMin}
            duration={winMax}
            time={time}
            ranges={[{ start: clip.start, end: clip.end }]}
            markers={clip.drawings.map((d) => ({ id: d.id, t: d.time, color: '#ffd60a', label: 'Drawing' }))}
            onSeek={(t) => {
              pb.clearFreeze();
              ctrl?.seek(t);
            }}
          />
          <Transport ctrl={ctrl} time={time} duration={duration} playing={playing}>
            <button className="btn sm primary" onClick={pb.playFromStart} disabled={!ctrl}>
              <Icon name="play" size={14} /> Play clip
            </button>
            <button className={`btn sm ${loop ? 'active' : ''}`} onClick={() => setLoop(!loop)}>
              <Icon name="repeat" size={14} /> Loop
            </button>
            <button className={`btn sm ${editing ? 'active' : ''}`} onClick={editing ? () => setEditing(null) : startDrawing} disabled={!ctrl}>
              <Icon name="pen" size={14} /> {editing ? 'Cancel drawing' : 'Draw at this frame'}
            </button>
          </Transport>

          {editing && (
            <div className="panel draw-panel">
              <DrawToolbar
                tool={tool}
                setTool={setTool}
                color={color}
                setColor={setColor}
                width={width}
                setWidth={setWidth}
                onUndo={() => setEditing({ ...editing, shapes: editing.shapes.slice(0, -1) })}
                onClear={() => setEditing({ ...editing, shapes: [] })}
                canUndo={editing.shapes.length > 0}
              />
              <div className="row gap wrap">
                <span className="muted small">
                  Freeze at <b className="mono">{fmtTime(editing.time, true)}</b> for
                </span>
                <input type="number" min={1} max={30} className="num" value={editing.hold} onChange={(e) => setEditing({ ...editing, hold: Math.max(1, Number(e.target.value)) })} />
                <span className="muted small">seconds</span>
                <button className="btn primary" disabled={!editing.shapes.length} onClick={saveDrawing}>
                  <Icon name="check" size={16} /> Save drawing
                </button>
              </div>
            </div>
          )}

          <div className="panel">
            <h3>Trim</h3>
            <div className="trim-grid">
              <div>
                <div className="label">Start {fmtTime(clip.start, true)}</div>
                <div className="row gap-s">
                  <button className="btn sm" onClick={() => setRange(clip.start - 1, clip.end)}>
                    −1s
                  </button>
                  <button className="btn sm" onClick={() => setRange(clip.start + 1, clip.end)}>
                    +1s
                  </button>
                  <button className="btn sm" onClick={() => setRange(time, clip.end)}>
                    <Icon name="markIn" size={14} /> Set to {fmtTime(time)}
                  </button>
                </div>
              </div>
              <div>
                <div className="label">End {fmtTime(clip.end, true)}</div>
                <div className="row gap-s">
                  <button className="btn sm" onClick={() => setRange(clip.start, clip.end - 1)}>
                    −1s
                  </button>
                  <button className="btn sm" onClick={() => setRange(clip.start, clip.end + 1)}>
                    +1s
                  </button>
                  <button className="btn sm" onClick={() => setRange(clip.start, time)}>
                    <Icon name="markOut" size={14} /> Set to {fmtTime(time)}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {clip.drawings.length > 0 && (
            <div className="panel">
              <h3>Freeze-frame drawings</h3>
              <ul className="event-list">
                {clip.drawings.map((d, i) => (
                  <li key={d.id} className="event-row">
                    <button
                      className="event-main"
                      onClick={() => {
                        pb.clearFreeze();
                        ctrl?.pause();
                        ctrl?.seek(d.time);
                      }}
                    >
                      <span className="mono time-cell">{fmtTime(d.time, true)}</span>
                      <span className="event-text">
                        <b>Drawing {i + 1}</b>
                        <span className="muted small block">
                          {d.shapes.length} mark{d.shapes.length === 1 ? '' : 's'} · holds {d.hold}s
                        </span>
                      </span>
                    </button>
                    <div className="row-actions">
                      <button
                        className="icon-btn sm"
                        title="Edit drawing"
                        onClick={() => {
                          ctrl?.pause();
                          ctrl?.seek(d.time);
                          setEditing({ id: d.id, time: d.time, hold: d.hold, shapes: d.shapes });
                        }}
                      >
                        <Icon name="edit" size={16} />
                      </button>
                      <button className="icon-btn sm" title="Delete drawing" onClick={() => db.clips.update(clip.id, { drawings: clip.drawings.filter((x) => x.id !== d.id) })}>
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="analyze-side stack">
          <section className="panel">
            <h3>Teaching clip</h3>
            {draft && <ClipForm value={draft} onChange={setDraft} tagTypes={tagTypes} players={players} />}
          </section>

          <section className="panel">
            <h3>Share</h3>
            {match?.source.kind === 'file' ? (
              canExport() ? (
                exporting !== null ? (
                  <div className="stack">
                    <div className="progress">
                      <div style={{ width: `${Math.round(exporting * 100)}%` }} />
                    </div>
                    <div className="row between">
                      <span className="muted small">Rendering {Math.round(exporting * 100)}%. Keep this screen open.</span>
                      <button className="btn sm" onClick={() => abort.current?.abort()}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="stack">
                    <label className="check small">
                      <input type="checkbox" checked={caption} onChange={(e) => setCaption(e.target.checked)} /> Add title caption
                    </label>
                    <button className="btn primary" onClick={doExport} disabled={!videoUrl}>
                      <Icon name="download" /> Export video (with drawings)
                    </button>
                    <p className="muted small">Creates a shareable video file for WhatsApp, email or a team drive. Rendering takes as long as the clip.</p>
                  </div>
                )
              ) : (
                <p className="muted small">This browser can't render video files. Try Chrome or Edge.</p>
              )
            ) : match?.source.kind === 'youtube' ? (
              <div className="stack">
                <button
                  className="btn"
                  onClick={async () => {
                    const link = youtubeClipLink((match.source as { youtubeId: string }).youtubeId, clip.start, clip.end);
                    try {
                      if (navigator.share) await navigator.share({ title: clip.title, text: clip.teachingPoint, url: link });
                      else {
                        await navigator.clipboard.writeText(link);
                        toast('Link copied');
                      }
                    } catch {
                      /* cancelled */
                    }
                  }}
                >
                  <Icon name="link" /> Share YouTube link to this moment
                </button>
                <p className="muted small">YouTube footage can't be downloaded, so we share a link that plays just this range. Drawings show inside Present mode.</p>
              </div>
            ) : null}
          </section>

          <FeedbackPanel clip={clip} players={players} />
        </aside>
      </div>
      {showAdd && <AddToPresentation clips={[clip]} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function FeedbackPanel({ clip, players }: { clip: Clip; players: { id: number; name: string; number?: number }[] }) {
  const list = useLiveQuery(() => db.feedback.where('clipId').equals(clip.id).toArray(), [clip.id]) ?? [];
  const [pid, setPid] = useState<number | ''>(clip.playerIds[0] ?? '');
  const [kind, setKind] = useState<FeedbackKind>('improve');
  const [text, setText] = useState('');
  const ordered = [...players.filter((p) => clip.playerIds.includes(p.id)), ...players.filter((p) => !clip.playerIds.includes(p.id))];
  return (
    <section className="panel">
      <h3>Player feedback</h3>
      <p className="muted small">Turn this visual into clear, individual feedback. It appears on the player's profile.</p>
      {list.map((f) => (
        <div key={f.id} className={`fb fb-${f.kind}`}>
          <b>{players.find((p) => p.id === f.playerId)?.name}</b> · {FEEDBACK_KINDS.find((k) => k.id === f.kind)?.label}
          <div>{f.text}</div>
        </div>
      ))}
      {players.length ? (
        <div className="stack">
          <div className="form-grid">
            <select value={pid} onChange={(e) => setPid(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Choose player…</option>
              {ordered.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number !== undefined ? `${p.number}. ` : ''}
                  {p.name}
                </option>
              ))}
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)}>
              {FEEDBACK_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Great scan before receiving. Next time open your body to play forward." />
          <button
            className="btn"
            disabled={!pid || !text.trim()}
            onClick={async () => {
              await db.feedback.add({ playerId: pid as number, clipId: clip.id, matchId: clip.matchId, kind, text: text.trim(), createdAt: Date.now() } as never);
              setText('');
              toast('Feedback saved to player profile');
            }}
          >
            <Icon name="message" size={16} /> Add feedback
          </button>
        </div>
      ) : (
        <p className="muted small">
          <Link to="/squad" className="link">
            Add players
          </Link>{' '}
          to give individual feedback.
        </p>
      )}
    </section>
  );
}
