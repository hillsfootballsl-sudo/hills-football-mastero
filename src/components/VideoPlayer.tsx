import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { loadYouTubeAPI, type YTPlayer } from '../lib/youtube';
import { containRect } from '../lib/draw';

export interface PlayerController {
  kind: 'file' | 'youtube';
  play(): void;
  pause(): void;
  toggle(): void;
  seek(t: number): void;
  getTime(): number;
  getDuration(): number;
  setRate(r: number): void;
  isPlaying(): boolean;
  /** The underlying <video> element for file sources (null for YouTube). */
  element(): HTMLVideoElement | null;
}

export type PlayerSource = { kind: 'file'; url: string } | { kind: 'youtube'; youtubeId: string };

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  source: PlayerSource;
  onReady?: (c: PlayerController) => void;
  onTime?: (t: number) => void;
  onPlayingChange?: (p: boolean) => void;
  onDuration?: (d: number) => void;
  /** Rendered absolutely over the video; receives the on-screen rectangle of the actual video frame. */
  overlay?: (rect: FrameRect, stage: { w: number; h: number }) => ReactNode;
  className?: string;
  startAt?: number;
  /** Tap the picture to play/pause (default true). */
  tapToggle?: boolean;
}

export default function VideoPlayer({ source, onReady, onTime, onPlayingChange, onDuration, overlay, className, startAt, tapToggle = true }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytHost = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [media, setMedia] = useState({ w: 16, h: 9 });
  const [error, setError] = useState<string | null>(null);
  const ctrlRef = useRef<PlayerController | null>(null);
  const cb = useRef({ onReady, onTime, onPlayingChange, onDuration });
  cb.current = {
    onReady: (c: PlayerController) => {
      ctrlRef.current = c;
      onReady?.(c);
    },
    onTime,
    onPlayingChange,
    onDuration,
  };

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setStage({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ---- File source ----
  useEffect(() => {
    if (source.kind !== 'file') return;
    const v = videoRef.current!;
    let raf = 0;
    let last = -1;
    const tick = () => {
      if (v.currentTime !== last) {
        last = v.currentTime;
        cb.current.onTime?.(v.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const ctrl: PlayerController = {
      kind: 'file',
      play: () => void v.play().catch(() => {}),
      pause: () => v.pause(),
      toggle: () => (v.paused ? void v.play().catch(() => {}) : v.pause()),
      seek: (t) => {
        v.currentTime = Math.max(0, Math.min(t, v.duration || t));
      },
      getTime: () => v.currentTime,
      getDuration: () => v.duration || 0,
      setRate: (r) => {
        v.playbackRate = r;
      },
      isPlaying: () => !v.paused,
      element: () => v,
    };
    const onMeta = () => {
      setMedia({ w: v.videoWidth || 16, h: v.videoHeight || 9 });
      // MediaRecorder webm files report Infinity until seeked to the end once.
      if (!isFinite(v.duration)) {
        const restore = v.currentTime;
        const fix = () => {
          v.removeEventListener('durationchange', fix);
          if (isFinite(v.duration)) {
            v.currentTime = restore;
            cb.current.onDuration?.(v.duration);
          }
        };
        v.addEventListener('durationchange', fix);
        v.currentTime = 1e9;
      } else cb.current.onDuration?.(v.duration);
      if (startAt) v.currentTime = startAt;
    };
    const onPlay = () => cb.current.onPlayingChange?.(true);
    const onPause = () => cb.current.onPlayingChange?.(false);
    const onErr = () => setError('This video could not be played in this browser. Try MP4 (H.264).');
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('error', onErr);
    if (v.readyState >= 1) onMeta();
    cb.current.onReady?.(ctrl);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('error', onErr);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.kind === 'file' ? source.url : null]);

  // ---- YouTube source ----
  const ytId = source.kind === 'youtube' ? source.youtubeId : null;
  useEffect(() => {
    if (!ytId) return;
    let player: YTPlayer | null = null;
    let poll = 0;
    let disposed = false;
    setMedia({ w: 16, h: 9 });
    setError(null);
    const host = document.createElement('div');
    ytHost.current!.appendChild(host);
    loadYouTubeAPI()
      .then(() => {
        if (disposed) return;
        let playing = false;
        player = new window.YT!.Player(host, {
          videoId: ytId,
          width: '100%',
          height: '100%',
          playerVars: { controls: 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1, iv_load_policy: 3, start: Math.floor(startAt ?? 0) },
          events: {
            onReady: () => {
              const p = player!;
              const ctrl: PlayerController = {
                kind: 'youtube',
                play: () => p.playVideo(),
                pause: () => p.pauseVideo(),
                toggle: () => (p.getPlayerState() === 1 ? p.pauseVideo() : p.playVideo()),
                seek: (t) => p.seekTo(Math.max(0, t), true),
                getTime: () => p.getCurrentTime() || 0,
                getDuration: () => p.getDuration() || 0,
                setRate: (r) => p.setPlaybackRate(r),
                isPlaying: () => p.getPlayerState() === 1,
                element: () => null,
              };
              cb.current.onReady?.(ctrl);
              poll = window.setInterval(() => {
                cb.current.onTime?.(p.getCurrentTime() || 0);
                const d = p.getDuration();
                if (d) cb.current.onDuration?.(d);
              }, 100);
            },
            onStateChange: (e: { data: number }) => {
              const now = e.data === 1;
              if (now !== playing) {
                playing = now;
                cb.current.onPlayingChange?.(now);
              }
            },
            onError: () => setError('YouTube refused to play this video (it may be private or embedding is disabled).'),
          },
        });
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      disposed = true;
      clearInterval(poll);
      try {
        player?.destroy();
      } catch {
        /* already gone */
      }
      host.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytId]);

  const rect = containRect(media.w, media.h, stage.w, stage.h);

  return (
    <div className={`stage ${className ?? ''}`} ref={stageRef} onClick={() => tapToggle && ctrlRef.current?.toggle()}>
      {source.kind === 'file' ? (
        <video ref={videoRef} src={source.url} playsInline preload="auto" className="stage-media" />
      ) : (
        <div ref={ytHost} className="stage-media yt-host" />
      )}
      {/* Shield stops taps reaching the YouTube iframe so our controls and drawings get them. */}
      {source.kind === 'youtube' && <div className="yt-shield" />}
      {overlay && stage.w > 0 && overlay(rect, stage)}
      {error && <div className="stage-error">{error}</div>}
    </div>
  );
}
