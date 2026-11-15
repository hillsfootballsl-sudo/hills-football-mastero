import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db, requestPersistentStorage, type Match, type VideoSource } from '../db';
import Icon from '../components/Icon';
import { PageHead } from '../components/ui';
import { parseYouTubeId } from '../lib/youtube';
import { fmtBytes, todayISO } from '../lib/format';

export type MatchDetails = Pick<Match, 'title' | 'opponent' | 'date' | 'competition' | 'venue' | 'scoreFor' | 'scoreAgainst'>;

export function blankDetails(): MatchDetails {
  return { title: '', opponent: '', date: todayISO(), competition: '', venue: 'home' };
}

export function MatchDetailsForm({ value, onChange }: { value: MatchDetails; onChange: (v: MatchDetails) => void }) {
  const set = <K extends keyof MatchDetails>(k: K, v: MatchDetails[K]) => onChange({ ...value, [k]: v });
  const num = (s: string) => (s === '' ? undefined : Math.max(0, Number(s)));
  return (
    <div className="form-grid">
      <label>
        Opponent
        <input value={value.opponent} onChange={(e) => set('opponent', e.target.value)} placeholder="e.g. Riverside FC" />
      </label>
      <label>
        Date
        <input type="date" value={value.date} onChange={(e) => set('date', e.target.value)} />
      </label>
      <label>
        Competition / session
        <input value={value.competition} onChange={(e) => set('competition', e.target.value)} placeholder="League, Cup, Training…" />
      </label>
      <label>
        Venue
        <select value={value.venue} onChange={(e) => set('venue', e.target.value as Match['venue'])}>
          <option value="home">Home</option>
          <option value="away">Away</option>
          <option value="neutral">Neutral</option>
        </select>
      </label>
      <label>
        Goals for
        <input type="number" min={0} inputMode="numeric" value={value.scoreFor ?? ''} onChange={(e) => set('scoreFor', num(e.target.value))} />
      </label>
      <label>
        Goals against
        <input type="number" min={0} inputMode="numeric" value={value.scoreAgainst ?? ''} onChange={(e) => set('scoreAgainst', num(e.target.value))} />
      </label>
      <label className="span-2">
        Title <span className="muted small">(optional, defaults to "Hills vs Opponent")</span>
        <input value={value.title} onChange={(e) => set('title', e.target.value)} placeholder="Hills vs Riverside FC" />
      </label>
    </div>
  );
}

export function matchTitle(d: MatchDetails) {
  return d.title.trim() || (d.opponent.trim() ? `Hills vs ${d.opponent.trim()}` : `Session ${d.date}`);
}

type Mode = 'upload' | 'youtube' | 'none';

/** Lets the user choose a video file or a YouTube link; returns the source to save. */
export function SourcePicker({ mode, setMode, file, setFile, yt, setYt, allowNone = true }: {
  mode: Mode;
  setMode: (m: Mode) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  yt: string;
  setYt: (s: string) => void;
  allowNone?: boolean;
}) {
  const ytId = parseYouTubeId(yt);
  return (
    <div className="source-picker">
      <div className="tabs">
        <button className={mode === 'upload' ? 'active' : ''} onClick={() => setMode('upload')}>
          <Icon name="upload" /> Video file
        </button>
        <button className={mode === 'youtube' ? 'active' : ''} onClick={() => setMode('youtube')}>
          <Icon name="youtube" /> YouTube link
        </button>
        {allowNone && (
          <button className={mode === 'none' ? 'active' : ''} onClick={() => setMode('none')}>
            <Icon name="zap" /> No video yet
          </button>
        )}
      </div>
      {mode === 'upload' && (
        <label className={`dropzone ${file ? 'has-file' : ''}`}>
          <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Icon name={file ? 'check' : 'upload'} size={28} />
          {file ? (
            <>
              <b>{file.name}</b>
              <span className="muted small">{fmtBytes(file.size)} · tap to change</span>
            </>
          ) : (
            <>
              <b>Choose a match video</b>
              <span className="muted small">MP4, MOV or WebM from your camera, phone or recorder. It stays on this device.</span>
            </>
          )}
        </label>
      )}
      {mode === 'youtube' && (
        <div className="stack">
          <input value={yt} onChange={(e) => setYt(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" autoFocus />
          {yt && !ytId && <p className="error small">That doesn't look like a YouTube link.</p>}
          {ytId && (
            <div className="yt-preview">
              <img src={`https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`} alt="" />
              <span className="muted small">Video ID {ytId}. Unlisted videos work; private videos and videos with embedding disabled won't play.</span>
            </div>
          )}
        </div>
      )}
      {mode === 'none' && <p className="muted">Create the match now, tag it live from the touchline, and attach the video later. Your live tags will sync to the footage.</p>}
    </div>
  );
}

export async function saveSource(mode: Mode, file: File | null, yt: string): Promise<VideoSource> {
  if (mode === 'upload' && file) {
    await requestPersistentStorage();
    const videoId = (await db.videos.add({ blob: file, mimeType: file.type || 'video/mp4', size: file.size } as never)) as number;
    return { kind: 'file', videoId, fileName: file.name };
  }
  const ytId = parseYouTubeId(yt);
  if (mode === 'youtube' && ytId) return { kind: 'youtube', youtubeId: ytId, url: yt.trim() };
  return { kind: 'none' };
}

export default function NewMatch() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const initialMode = (params.get('mode') as Mode) || 'upload';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [details, setDetails] = useState<MatchDetails>(blankDetails());
  const [file, setFile] = useState<File | null>(null);
  const [yt, setYt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ready = (mode === 'upload' && file) || (mode === 'youtube' && parseYouTubeId(yt)) || mode === 'none';

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const source = await saveSource(mode, file, yt);
      const id = (await db.matches.add({ ...details, title: matchTitle(details), source, kickoffs: {}, createdAt: Date.now() } as Match)) as number;
      nav(mode === 'none' || params.get('next') === 'live' ? `/live/${id}` : `/matches/${id}`, { replace: true });
    } catch (e) {
      setErr(e instanceof Error && e.name === 'QuotaExceededError' ? 'Not enough storage space on this device for that video.' : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <PageHead title="New match" kicker="Step 1 · Structure" />
      <section className="panel">
        <h3>Footage</h3>
        <SourcePicker mode={mode} setMode={setMode} file={file} setFile={setFile} yt={yt} setYt={setYt} />
      </section>
      <section className="panel">
        <h3>Match details</h3>
        <MatchDetailsForm value={details} onChange={setDetails} />
      </section>
      {err && <p className="error">{err}</p>}
      <div className="row end gap">
        <button className="btn" onClick={() => nav(-1)}>
          Cancel
        </button>
        <button className="btn primary lg" disabled={!ready || busy} onClick={create}>
          {busy ? 'Saving…' : mode === 'none' ? 'Create & start live tagging' : 'Create & start tagging'}
        </button>
      </div>
    </div>
  );
}
