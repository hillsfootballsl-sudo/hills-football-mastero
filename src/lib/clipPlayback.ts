import { useEffect, useRef, useState } from 'react';
import type { Clip, Drawing } from '../db';
import type { PlayerController } from '../components/VideoPlayer';

/**
 * Plays a clip's range, pausing on each freeze-frame drawing for its hold time.
 * Feed `onTime` from the VideoPlayer and render `active.shapes` over the video.
 */
export function useClipPlayback(ctrl: PlayerController | null, clip: Clip | undefined | null, opts: { loop?: boolean; onEnd?: () => void } = {}) {
  const [active, setActive] = useState<Drawing | null>(null);
  const prev = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const activeRef = useRef<Drawing | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const clearFreeze = () => {
    clearTimeout(timer.current);
    activeRef.current = null;
    setActive(null);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const onTime = (t: number) => {
    const p = prev.current;
    prev.current = t;
    if (!clip || !ctrl || activeRef.current || !ctrl.isPlaying()) return;
    const jumped = t - p > 1.5 || t < p;
    if (!jumped) {
      const d = clip.drawings.find((d) => p < d.time && t >= d.time);
      if (d) {
        ctrl.pause();
        ctrl.seek(d.time);
        activeRef.current = d;
        setActive(d);
        timer.current = window.setTimeout(() => {
          activeRef.current = null;
          setActive(null);
          prev.current = d.time + 0.001;
          ctrl.play();
        }, d.hold * 1000);
        return;
      }
    }
    if (t >= clip.end) {
      if (optsRef.current.loop) {
        prev.current = clip.start - 0.01;
        ctrl.seek(clip.start);
      } else {
        ctrl.pause();
        optsRef.current.onEnd?.();
      }
    }
  };

  const playFromStart = () => {
    if (!ctrl || !clip) return;
    clearFreeze();
    prev.current = clip.start - 0.01;
    ctrl.seek(clip.start);
    ctrl.play();
  };

  return { onTime, active, playFromStart, clearFreeze };
}
