import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, requestPersistentStorage, uid, type Match, type TagEvent, type TagType, type Team } from '../db';
import Icon from '../components/Icon';
import { PageHead, PlayerChips, toast } from '../components/ui';
import { usePlayers, useTagTypes } from '../lib/hooks';
import { fmtBytes, fmtTime, todayISO } from '../lib/format';
import { useWakeLock } from './Live';

type PendingTag = Pick<TagEvent, 'tagTypeId' | 'team' | 'playerIds' | 'time'>;

function pickMime() {
  const opts = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return opts.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
}

const QUALITY = {
  '720p': { width: 1280, height: 720, bps: 4_000_000 },
  '1080p': { width: 1920, height: 1080, bps: 8_000_000 },
  '480p': { width: 854, height: 480, bps: 1_800_000 },
} as const;

/** Assemble saved chunks into a match, attaching any tags made while recording. */
async function finalizeSession(sessionId: string, details: { opponent: string; competition: string }, tags: PendingTag[]): Promise<number> {
  const chunks = await db.recordingChunks.where('sessionId').equals(sessionId).sortBy('seq');
  if (!chunks.length) throw new Error('Nothing was recorded.');
  const mimeType = chunks[0].mimeType.split(';')[0] || 'video/webm';
  const blob = new Blob(
    chunks.map((c) => c.blob),
    { type: mimeType },
  );
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const date = new Date(chunks[0].startedAt);
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return db.transaction('rw', [db.videos, db.matches, db.events, db.recordingChunks], async () => {
    const videoId = (await db.videos.add({ blob, mimeType, size: blob.size } as never)) as number;
    const opp = details.opponent.trim();
    const matchId = (await db.matches.add({
      title: opp ? `Hills vs ${opp}` : `Recording ${iso}`,
      opponent: opp,
      date: iso || todayISO(),
      competition: details.competition.trim(),
      venue: 'home',
      source: { kind: 'file', videoId, fileName: `recording-${iso}.${ext}` },
      kickoffs: {},
      createdAt: Date.now(),
    } as Match)) as number;
    if (tags.length)
      await db.events.bulkAdd(tags.map((t, i) => ({ ...t, matchId, note: '', mode: 'video', half: 1, createdAt: Date.now() + i }) as TagEvent));
    await db.recordingChunks.where('sessionId').equals(sessionId).delete();
    localStorage.removeItem(`rec-tags-${sessionId}`);
    return matchId;
  });
}

export default function Record() {
  const nav = useNavigate();
  const preview = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [quality, setQuality] = useState<keyof typeof QUALITY>('720p');
  const [withAudio, setWithAudio] = useState(true);
  const [camError, setCamError] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'recording' | 'paused' | 'saving'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [details, setDetails] = useState({ opponent: '', competition: '' });
  const [tags, setTags] = useState<PendingTag[]>([]);
  const [team, setTeam] = useState<Team>('us');
  const [sel, setSel] = useState<number[]>([]);
  const tagTypes = useTagTypes();
  const players = usePlayers().filter((p) => p.active);
  const rec = useRef<{ mr: MediaRecorder; sessionId: string; seq: number; startedAt: number; acc: number; segStart: number } | null>(null);

  useWakeLock(state === 'recording' || state === 'paused');

  // Sessions left behind by a crash or closed tab.
  const orphans = useLiveQuery(async () => {
    if (state !== 'idle') return [];
    const all = await db.recordingChunks.toArray();
    const by = new Map<string, { size: number; startedAt: number; n: number }>();
    for (const c of all) {
      if (c.sessionId === rec.current?.sessionId) continue;
      const o = by.get(c.sessionId) ?? { size: 0, startedAt: c.startedAt, n: 0 };
      o.size += c.blob.size;
      o.n++;
      by.set(c.sessionId, o);
    }
    return [...by.entries()];
  }, [state]);

  useEffect(() => {
    if (state !== 'idle') return;
    let s: MediaStream | null = null;
    let cancelled = false;
    setCamError(null);
    const q = QUALITY[quality];
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: facing, width: { ideal: q.width }, height: { ideal: q.height } }, audio: withAudio })
      .then((ms) => {
        if (cancelled) return ms.getTracks().forEach((t) => t.stop());
        s = ms;
        setStream(ms);
        if (preview.current) preview.current.srcObject = ms;
      })
      .catch((e: Error) => setCamError(e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser settings.' : `Camera unavailable: ${e.message}`));
    if (!navigator.mediaDevices) setCamError('Recording needs a secure (https) connection and a browser with camera support.');
    return () => {
      cancelled = true;
      s?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, quality, withAudio]);

  useEffect(() => {
    if (state !== 'recording') return;
    const t = setInterval(() => {
      const r = rec.current;
      if (r) setElapsed(r.acc + (Date.now() - r.segStart) / 1000);
    }, 250);
    return () => clearInterval(t);
  }, [state]);

  const recTime = () => {
    const r = rec.current;
    if (!r) return 0;
    return r.acc + (state === 'recording' ? (Date.now() - r.segStart) / 1000 : 0);
  };

  const start = async () => {
    if (!stream) return;
    await requestPersistentStorage();
    const mimeType = pickMime();
    const mr = new MediaRecorder(stream, { mimeType: mimeType || undefined, videoBitsPerSecond: QUALITY[quality].bps });
    const sessionId = uid();
    const r = { mr, sessionId, seq: 0, startedAt: Date.now(), acc: 0, segStart: Date.now() };
    rec.current = r;
    mr.ondataavailable = (e) => {
      if (!e.data.size) return;
      setBytes((b) => b + e.data.size);
      db.recordingChunks.add({ sessionId, seq: r.seq++, blob: e.data, mimeType: mr.mimeType || mimeType, startedAt: r.startedAt } as never);
    };
    mr.start(3000);
    setTags([]);
    setBytes(0);
    setElapsed(0);
    setState('recording');
  };

  const pause = () => {
    const r = rec.current!;
    if (state === 'recording') {
      r.mr.pause();
      r.acc += (Date.now() - r.segStart) / 1000;
      setElapsed(r.acc);
      setState('paused');
    } else {
      r.mr.resume();
      r.segStart = Date.now();
      setState('recording');
    }
  };

  const stop = async () => {
    const r = rec.current!;
    setState('saving');
    await new Promise<void>((res) => {
      r.mr.addEventListener('stop', () => setTimeout(res, 300), { once: true });
      r.mr.stop();
    });
    try {
      const id = await finalizeSession(r.sessionId, details, tags);
      rec.current = null;
      toast('Recording saved');
      nav(`/matches/${id}`);
    } catch (e) {
      toast(String(e));
      setState('idle');
    }
  };

  const tag = (tt: TagType) => {
    const t: PendingTag = { tagTypeId: tt.id, team, playerIds: sel, time: recTime() };
    const next = [...tags, t];
    setTags(next);
    setSel([]);
    if (rec.current) localStorage.setItem(`rec-tags-${rec.current.sessionId}`, JSON.stringify(next));
    toast(`${tt.name} at ${fmtTime(t.time)}`);
  };

  const recover = async (sessionId: string) => {
    let saved: PendingTag[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(`rec-tags-${sessionId}`) ?? '[]');
    } catch {
      /* ignore */
    }
    const id = await finalizeSession(sessionId, { opponent: '', competition: 'Recovered recording' }, saved);
    nav(`/matches/${id}`);
  };

  const live = state === 'recording' || state === 'paused';

  return (
    <div className="page record-page">
      <PageHead title="Record" kicker="Step 1 · Capture" />
      {orphans && orphans.length > 0 && !live && (
        <div className="callout warn">
          <Icon name="database" />
          <div className="grow">
            <b>Unsaved recording found.</b> A previous recording wasn't finished (the app may have closed).
            {orphans.map(([sid, o]) => (
              <div key={sid} className="row gap-s wrap" style={{ marginTop: 8 }}>
                <span className="muted small">
                  {new Date(o.startedAt).toLocaleString()} · {fmtBytes(o.size)}
                </span>
                <button className="btn sm primary" onClick={() => recover(sid)}>
                  Recover
                </button>
                <button
                  className="btn sm"
                  onClick={async () => {
                    if (confirm('Discard this unsaved recording?')) await db.recordingChunks.where('sessionId').equals(sid).delete();
                  }}
                >
                  Discard
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="record-layout">
        <div className="stack">
          <div className="stage record-stage">
            <video ref={preview} autoPlay muted playsInline className="stage-media" />
            {camError && <div className="stage-error">{camError}</div>}
            {live && (
              <div className={`rec-badge ${state}`}>
                <span className="rec-dot" /> {state === 'paused' ? 'PAUSED' : 'REC'} <span className="mono">{fmtTime(elapsed)}</span>
                <span className="muted small">{fmtBytes(bytes)}</span>
              </div>
            )}
          </div>
          <div className="row gap wrap center">
            {!live ? (
              <>
                <button className="btn" onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')} disabled={state !== 'idle'}>
                  <Icon name="flip" /> Flip camera
                </button>
                <button className="btn primary lg rec-btn" onClick={start} disabled={!stream || state !== 'idle'}>
                  <Icon name="rec" size={16} /> {state === 'saving' ? 'Saving…' : 'Start recording'}
                </button>
                <select value={quality} onChange={(e) => setQuality(e.target.value as keyof typeof QUALITY)} aria-label="Quality">
                  <option value="480p">480p (smallest)</option>
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                </select>
                <label className="check">
                  <input type="checkbox" checked={withAudio} onChange={(e) => setWithAudio(e.target.checked)} /> Audio
                </label>
              </>
            ) : (
              <>
                <button className="btn lg" onClick={pause}>
                  <Icon name={state === 'paused' ? 'play' : 'pause'} /> {state === 'paused' ? 'Resume' : 'Pause'}
                </button>
                <button className="btn danger lg" onClick={stop}>
                  <Icon name="stop" /> Stop & save
                </button>
              </>
            )}
          </div>
          <p className="hint">
            Tip: mount the tablet or phone high on a tripod at the halfway line. Footage is saved to this device every few seconds, so nothing is lost if the app closes. About {quality === '1080p' ? '3.5 GB' : quality === '720p' ? '1.8 GB' : '0.8 GB'} per hour.
          </p>
        </div>
        <aside className="panel stack">
          <h3>Match</h3>
          <input placeholder="Opponent" value={details.opponent} onChange={(e) => setDetails({ ...details, opponent: e.target.value })} />
          <input placeholder="Competition / session" value={details.competition} onChange={(e) => setDetails({ ...details, competition: e.target.value })} />
          <h3>Tag while recording</h3>
          <div className="team-toggle">
            <button className={team === 'us' ? 'active' : ''} onClick={() => setTeam('us')}>
              Hills
            </button>
            <button className={team === 'them' ? 'active them' : ''} onClick={() => setTeam('them')}>
              {details.opponent || 'Opponent'}
            </button>
          </div>
          <div className="tag-grid">
            {tagTypes.map((t) => (
              <button key={t.id} className="tag-btn" style={{ '--c': t.color } as React.CSSProperties} disabled={state !== 'recording'} onClick={() => tag(t)}>
                <span>{t.name}</span>
              </button>
            ))}
          </div>
          <PlayerChips players={players} selected={sel} onChange={setSel} compact />
          <p className="muted small">{tags.length} moments tagged. They'll appear on the match timeline.</p>
        </aside>
      </div>
    </div>
  );
}
