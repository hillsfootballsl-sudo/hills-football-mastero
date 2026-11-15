import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Clip, type Match, type Presentation } from '../db';
import VideoPlayer, { type PlayerController, type PlayerSource } from '../components/VideoPlayer';
import { DrawingCanvas } from '../components/Telestrator';
import Icon from '../components/Icon';
import { useMatchVideoUrl } from '../lib/hooks';
import { useClipPlayback } from '../lib/clipPlayback';

type Slide =
  | { kind: 'title' }
  | { kind: 'section'; index: number }
  | { kind: 'clip'; section: number; item: number; clip: Clip; notes: string }
  | { kind: 'end' };

export default function Present() {
  const { id } = useParams();
  const pid = Number(id);
  const p = useLiveQuery(() => db.presentations.get(pid).then((x) => x ?? null), [pid]);
  const clips = useLiveQuery(() => db.clips.toArray()) ?? [];
  const matches = useLiveQuery(() => db.matches.toArray()) ?? [];
  const [i, setI] = useState(0);
  const [showNotes, setShowNotes] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  const clipById = useMemo(() => new Map(clips.map((c) => [c.id, c])), [clips]);
  const slides: Slide[] = useMemo(() => {
    if (!p) return [];
    const out: Slide[] = [{ kind: 'title' }];
    p.sections.forEach((s, si) => {
      out.push({ kind: 'section', index: si });
      s.items.forEach((it, ii) => {
        const c = clipById.get(it.clipId);
        if (c) out.push({ kind: 'clip', section: si, item: ii, clip: c, notes: it.notes });
      });
    });
    out.push({ kind: 'end' });
    return out;
  }, [p, clipById]);

  const go = (d: number) => setI((x) => Math.max(0, Math.min(slides.length - 1, x + d)));

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', 'n'].includes(e.key)) go(1);
      else if (['ArrowLeft', 'PageUp', 'p'].includes(e.key)) go(-1);
      else if (e.key === 'f') toggleFs();
      else if (e.key === 'h') setShowNotes((v) => !v);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  if (p === undefined) return <div className="present" />;
  if (p === null) return <div className="present center-msg">Presentation not found</div>;
  const slide = slides[Math.min(i, slides.length - 1)];

  return (
    <div className="present" ref={rootRef}>
      <div className="present-top">
        <Link to={`/presentations/${p.id}`} className="icon-btn" title="Exit">
          <Icon name="x" />
        </Link>
        <div className="present-brand">
          <img src="favicon.svg" alt="" width={22} height={22} /> Hills Football <i>Mastero</i>
        </div>
        <div className="row gap-s">
          <button className={`icon-btn ${showNotes ? 'active' : ''}`} onClick={() => setShowNotes(!showNotes)} title="Toggle notes (H)">
            <Icon name="message" />
          </button>
          <button className="icon-btn" onClick={toggleFs} title="Fullscreen (F)">
            <Icon name="maximize" />
          </button>
        </div>
      </div>

      <div className="present-stage">
        {slide.kind === 'title' && (
          <div className="slide slide-title">
            <div className="kicker">{p.audience || 'Team meeting'}</div>
            <h1 className="hero-title">
              {p.title.split(' ').length > 2 ? (
                <>
                  <span>{p.title.split(' ').slice(0, Math.ceil(p.title.split(' ').length / 2)).join(' ')}</span>
                  <span>{p.title.split(' ').slice(Math.ceil(p.title.split(' ').length / 2)).join(' ')}</span>
                </>
              ) : (
                <span>{p.title}</span>
              )}
            </h1>
            {p.summary && <p className="slide-summary">{p.summary}</p>}
            <ol className="agenda">
              {p.sections.map((s, si) => (
                <li key={s.id}>
                  <span className="step-n">{si + 1}.</span> {s.objective || 'Objective'}
                </li>
              ))}
            </ol>
          </div>
        )}
        {slide.kind === 'section' && <SectionSlide p={p} index={slide.index} clipById={clipById} />}
        {slide.kind === 'clip' && (
          <ClipSlide key={`${slide.section}-${slide.item}`} clip={slide.clip} notes={slide.notes} match={matches.find((m) => m.id === slide.clip.matchId)} objective={p.sections[slide.section].objective} index={slide.section} showNotes={showNotes} />
        )}
        {slide.kind === 'end' && (
          <div className="slide slide-end">
            <div className="flow-steps">
              {['From Recording', 'To Understanding', 'To Real Development'].map((s, k) => (
                <div key={s} className="flow-step big" style={{ marginLeft: k * 40 }}>
                  {s}
                </div>
              ))}
            </div>
            {p.summary && <p className="slide-summary">{p.summary}</p>}
          </div>
        )}
      </div>

      <div className="present-nav">
        <button className="icon-btn" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous">
          <Icon name="left" />
        </button>
        <div className="dots">
          {slides.map((s, k) => (
            <button key={k} className={`dot ${k === i ? 'on' : ''} ${s.kind === 'section' ? 'sec' : ''}`} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} />
          ))}
        </div>
        <button className="icon-btn" onClick={() => go(1)} disabled={i >= slides.length - 1} aria-label="Next">
          <Icon name="right" />
        </button>
      </div>
    </div>
  );
}

function SectionSlide({ p, index, clipById }: { p: Presentation; index: number; clipById: Map<number, Clip> }) {
  const s = p.sections[index];
  return (
    <div className="slide slide-section">
      <div className="section-badge">
        <span className="step-n big">{index + 1}.</span>
        <h2>{s.objective || 'Objective'}</h2>
      </div>
      <ul className="slide-list">
        {s.items.map((it) => {
          const c = clipById.get(it.clipId);
          return c ? (
            <li key={it.clipId}>
              <Icon name="play" size={16} /> {c.title}
            </li>
          ) : null;
        })}
      </ul>
    </div>
  );
}

function ClipSlide({ clip, notes, match, objective, index, showNotes }: { clip: Clip; notes: string; match?: Match; objective: string; index: number; showNotes: boolean }) {
  const url = useMatchVideoUrl(match);
  const [ctrl, setCtrl] = useState<PlayerController | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [loop, setLoop] = useState(false);
  const pb = useClipPlayback(ctrl, clip, { loop, onEnd: () => setEnded(true) });
  const started = useRef(false);

  useEffect(() => {
    if (ctrl && !started.current) {
      started.current = true;
      // Give YouTube a moment to cue the video before seeking.
      setTimeout(() => pb.playFromStart(), ctrl.kind === 'youtube' ? 600 : 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctrl]);

  const source: PlayerSource | null = match?.source.kind === 'youtube' ? { kind: 'youtube', youtubeId: match.source.youtubeId } : url ? { kind: 'file', url } : null;

  return (
    <div className="slide slide-clip">
      <div className="clip-label">
        <span className="step-n">{index + 1}.</span> {objective}
      </div>
      <div className="clip-video">
        {source ? (
          <VideoPlayer
            source={source}
            startAt={clip.start}
            onReady={setCtrl}
            onTime={(t) => {
              pb.onTime(t);
              if (t < clip.end - 0.2) setEnded(false);
            }}
            onPlayingChange={setPlaying}
            overlay={(rect, stage) => pb.active && <DrawingCanvas rect={rect} stage={stage} shapes={pb.active.shapes} />}
          />
        ) : (
          <div className="stage loading">Video unavailable</div>
        )}
        <div className="clip-controls">
          <button className="icon-btn" onClick={pb.playFromStart} title="Replay">
            <Icon name="undo" />
          </button>
          <button
            className="icon-btn play"
            onClick={() => {
              pb.clearFreeze();
              if (ended) pb.playFromStart();
              else ctrl?.toggle();
            }}
          >
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
          <button className={`icon-btn ${loop ? 'active' : ''}`} onClick={() => setLoop(!loop)} title="Loop">
            <Icon name="repeat" />
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              pb.clearFreeze();
              ctrl?.setRate(0.5);
            }}
            title="Slow motion"
          >
            ½×
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              ctrl?.setRate(1);
            }}
            title="Normal speed"
          >
            1×
          </button>
        </div>
      </div>
      {showNotes && (
        <div className="clip-notes">
          <h2>{clip.title}</h2>
          {(notes || clip.teachingPoint) && <p>{notes || clip.teachingPoint}</p>}
        </div>
      )}
    </div>
  );
}
