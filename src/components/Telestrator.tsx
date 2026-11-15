import { useEffect, useRef } from 'react';
import type { Shape } from '../db';
import { renderShapes } from '../lib/draw';
import type { FrameRect } from './VideoPlayer';
import Icon from './Icon';

export type Tool = 'arrow' | 'dashed' | 'line' | 'circle' | 'free' | 'zone' | 'text';

export const DRAW_COLORS = ['#c8f04a', '#ffffff', '#ffd60a', '#ff4d6d', '#5eb8ff', '#111827'];

interface CanvasProps {
  rect: FrameRect;
  stage: { w: number; h: number };
  shapes: Shape[];
  /** When provided, the canvas captures pointer input and calls this with the new shape list. */
  onChange?: (shapes: Shape[]) => void;
  tool?: Tool;
  color?: string;
  width?: number;
}

export function DrawingCanvas({ rect, stage, shapes, onChange, tool = 'arrow', color = DRAW_COLORS[0], width = 3 }: CanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const draft = useRef<Shape | null>(null);
  const editable = !!onChange;

  const paint = () => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(stage.w * dpr) || c.height !== Math.round(stage.h * dpr)) {
      c.width = Math.round(stage.w * dpr);
      c.height = Math.round(stage.h * dpr);
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, stage.w, stage.h);
    const all = draft.current ? [...shapes, draft.current] : shapes;
    renderShapes(ctx, all, rect.w, rect.h, rect.x, rect.y);
  };

  useEffect(paint);

  const norm = (e: React.PointerEvent): [number, number] => {
    const b = ref.current!.getBoundingClientRect();
    const x = (e.clientX - b.left - rect.x) / rect.w;
    const y = (e.clientY - b.top - rect.y) / rect.h;
    return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
  };

  const down = (e: React.PointerEvent) => {
    if (!editable) return;
    e.stopPropagation();
    e.preventDefault();
    const [x, y] = norm(e);
    if (tool === 'text') {
      const text = window.prompt('Label text');
      if (text?.trim()) onChange!([...shapes, { kind: 'text', color, width, x, y, text: text.trim() }]);
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    if (tool === 'circle') draft.current = { kind: 'circle', color, width, cx: x, cy: y, rx: 0, ry: 0 };
    else if (tool === 'free' || tool === 'zone') draft.current = { kind: tool, color, width, points: [[x, y]] };
    else draft.current = { kind: tool, color, width, x1: x, y1: y, x2: x, y2: y };
    paint();
  };

  const move = (e: React.PointerEvent) => {
    const d = draft.current;
    if (!d) return;
    const [x, y] = norm(e);
    if (d.kind === 'circle') {
      d.rx = x - d.cx;
      d.ry = y - d.cy;
    } else if (d.kind === 'free' || d.kind === 'zone') d.points.push([x, y]);
    else if (d.kind !== 'text') {
      d.x2 = x;
      d.y2 = y;
    }
    paint();
  };

  const up = () => {
    const d = draft.current;
    draft.current = null;
    if (!d) return;
    const tiny =
      (d.kind === 'circle' && Math.abs(d.rx) + Math.abs(d.ry) < 0.01) ||
      ((d.kind === 'arrow' || d.kind === 'line' || d.kind === 'dashed') && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 0.01) ||
      ((d.kind === 'free' || d.kind === 'zone') && d.points.length < 3);
    if (!tiny) onChange!([...shapes, d]);
    else paint();
  };

  return (
    <canvas
      ref={ref}
      className={`draw-canvas ${editable ? 'editing' : ''}`}
      style={{ width: stage.w, height: stage.h }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={(e) => editable && e.stopPropagation()}
    />
  );
}

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'arrow', label: 'Arrow (pass/run)', icon: 'arrow' },
  { id: 'dashed', label: 'Dashed arrow (movement)', icon: 'dashed' },
  { id: 'line', label: 'Line (shape/link players)', icon: 'line' },
  { id: 'circle', label: 'Circle (spotlight player)', icon: 'circle' },
  { id: 'zone', label: 'Zone (space)', icon: 'zone' },
  { id: 'free', label: 'Freehand', icon: 'pen' },
  { id: 'text', label: 'Text label', icon: 'text' },
];

interface ToolbarProps {
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  setColor: (c: string) => void;
  width: number;
  setWidth: (w: number) => void;
  onUndo: () => void;
  onClear: () => void;
  canUndo: boolean;
  extra?: React.ReactNode;
}

export function DrawToolbar({ tool, setTool, color, setColor, width, setWidth, onUndo, onClear, canUndo, extra }: ToolbarProps) {
  return (
    <div className="draw-toolbar">
      <div className="seg">
        {TOOLS.map((t) => (
          <button key={t.id} className={`icon-btn ${tool === t.id ? 'active' : ''}`} title={t.label} aria-label={t.label} onClick={() => setTool(t.id)}>
            <Icon name={t.icon} />
          </button>
        ))}
      </div>
      <div className="seg">
        {DRAW_COLORS.map((c) => (
          <button key={c} className={`swatch ${color === c ? 'active' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => setColor(c)} />
        ))}
      </div>
      <div className="seg">
        {[2, 3, 5].map((w) => (
          <button key={w} className={`icon-btn ${width === w ? 'active' : ''}`} title={`Thickness ${w}`} onClick={() => setWidth(w)}>
            <span className="thick" style={{ height: w * 1.6 }} />
          </button>
        ))}
      </div>
      <div className="seg">
        <button className="icon-btn" title="Undo" onClick={onUndo} disabled={!canUndo}>
          <Icon name="undo" />
        </button>
        <button className="icon-btn" title="Clear" onClick={onClear} disabled={!canUndo}>
          <Icon name="trash" />
        </button>
      </div>
      {extra}
    </div>
  );
}
