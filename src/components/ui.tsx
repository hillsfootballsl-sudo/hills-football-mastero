import { useEffect, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';
import type { PlayerController } from './VideoPlayer';
import { fmtTime } from '../lib/format';
import type { Player, TagType } from '../db';

export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={28} />
      </div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function PageHead({ title, kicker, children }: { title: string; kicker?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {kicker && <div className="kicker">{kicker}</div>}
        <h1>{title}</h1>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function PlayerChips({ players, selected, onChange, compact }: { players: Player[]; selected: number[]; onChange: (ids: number[]) => void; compact?: boolean }) {
  if (!players.length) return <p className="muted small">Add players in Squad to tag them.</p>;
  return (
    <div className={`chips ${compact ? 'compact' : ''}`}>
      {players.map((p) => {
        const on = selected.includes(p.id);
        return (
          <button key={p.id} className={`chip ${on ? 'on' : ''}`} onClick={() => onChange(on ? selected.filter((x) => x !== p.id) : [...selected, p.id])}>
            {p.number !== undefined && <b>{p.number}</b>} {p.name}
          </button>
        );
      })}
    </div>
  );
}

export function TagDot({ t }: { t?: TagType }) {
  return <span className="tag-dot" style={{ background: t?.color ?? '#64748b' }} />;
}

export function TagBadge({ t }: { t?: TagType }) {
  if (!t) return null;
  return (
    <span className="tag-badge" style={{ '--c': t.color } as React.CSSProperties}>
      {t.name}
    </span>
  );
}

export interface Marker {
  id: number | string;
  t: number;
  color: string;
  label?: string;
}

export function Timeline({
  duration,
  time,
  markers = [],
  ranges = [],
  markIn,
  markOut,
  onSeek,
  min = 0,
}: {
  duration: number;
  time: number;
  markers?: Marker[];
  ranges?: { start: number; end: number; color?: string }[];
  markIn?: number | null;
  markOut?: number | null;
  onSeek: (t: number) => void;
  min?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const span = Math.max(0.001, duration - min);
  const pct = (t: number) => `${Math.max(0, Math.min(100, ((t - min) / span) * 100))}%`;
  const seekFrom = (e: React.PointerEvent) => {
    const b = ref.current!.getBoundingClientRect();
    onSeek(min + Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)) * span);
  };
  return (
    <div
      className="timeline"
      ref={ref}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        seekFrom(e);
      }}
      onPointerMove={(e) => e.buttons && seekFrom(e)}
      role="slider"
      aria-label="Seek"
      aria-valuemin={min}
      aria-valuemax={duration}
      aria-valuenow={time}
    >
      <div className="tl-track" />
      {ranges.map((r, i) => (
        <div key={i} className="tl-range" style={{ left: pct(r.start), width: `calc(${pct(r.end)} - ${pct(r.start)})`, background: r.color }} />
      ))}
      {markIn != null && markOut != null && markOut > markIn && (
        <div className="tl-sel" style={{ left: pct(markIn), width: `calc(${pct(markOut)} - ${pct(markIn)})` }} />
      )}
      {markIn != null && <div className="tl-mark in" style={{ left: pct(markIn) }} />}
      {markOut != null && <div className="tl-mark out" style={{ left: pct(markOut) }} />}
      <div className="tl-fill" style={{ width: pct(time) }} />
      {markers.map((m) => (
        <div key={m.id} className="tl-marker" style={{ left: pct(m.t), background: m.color }} title={m.label ? `${m.label} · ${fmtTime(m.t)}` : fmtTime(m.t)} />
      ))}
      <div className="tl-head" style={{ left: pct(time) }} />
    </div>
  );
}

export const RATES = [0.25, 0.5, 1, 1.5, 2];

export function Transport({
  ctrl,
  time,
  duration,
  playing,
  children,
  frameStep = true,
  showRate = true,
}: {
  ctrl: PlayerController | null;
  time: number;
  duration: number;
  playing: boolean;
  children?: ReactNode;
  frameStep?: boolean;
  showRate?: boolean;
}) {
  const [rate, setRate] = useState(1);
  const jump = (d: number) => ctrl && ctrl.seek(ctrl.getTime() + d);
  return (
    <div className="transport">
      <button className="icon-btn" onClick={() => jump(-5)} title="Back 5s (←)" disabled={!ctrl}>
        <Icon name="back" />
      </button>
      {frameStep && (
        <button
          className="icon-btn"
          onClick={() => {
            ctrl?.pause();
            jump(-1 / 25);
          }}
          title="Previous frame (,)"
          disabled={!ctrl}
        >
          <Icon name="stepBack" />
        </button>
      )}
      <button className="icon-btn play" onClick={() => ctrl?.toggle()} title="Play/Pause (Space)" disabled={!ctrl}>
        <Icon name={playing ? 'pause' : 'play'} size={22} />
      </button>
      {frameStep && (
        <button
          className="icon-btn"
          onClick={() => {
            ctrl?.pause();
            jump(1 / 25);
          }}
          title="Next frame (.)"
          disabled={!ctrl}
        >
          <Icon name="stepFwd" />
        </button>
      )}
      <button className="icon-btn" onClick={() => jump(5)} title="Forward 5s (→)" disabled={!ctrl}>
        <Icon name="fwd" />
      </button>
      <span className="time mono">
        {fmtTime(time)} <span className="muted">/ {fmtTime(duration)}</span>
      </span>
      {showRate && (
        <select
          className="rate"
          value={rate}
          onChange={(e) => {
            const r = Number(e.target.value);
            setRate(r);
            ctrl?.setRate(r);
          }}
          aria-label="Playback speed"
        >
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
      )}
      <div className="transport-extra">{children}</div>
    </div>
  );
}

let toastSetter: ((m: string | null) => void) | null = null;
export function toast(msg: string) {
  toastSetter?.(msg);
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastSetter = setMsg;
    return () => {
      toastSetter = null;
    };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
}

/** True when the keyboard event target is a text field (so hotkeys shouldn't fire). */
export function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
