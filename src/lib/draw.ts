import type { Shape } from '../db';

/**
 * Shapes use normalised coordinates (0..1) relative to the video frame, so a drawing
 * made on a tablet renders identically on a projector or in an exported clip.
 * Stroke width is in "units" of 1/400 of the frame height.
 */
export function renderShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], w: number, h: number, ox = 0, oy = 0) {
  const unit = h / 400;
  for (const s of shapes) {
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.width * unit;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 4 * unit;
    const X = (x: number) => ox + x * w;
    const Y = (y: number) => oy + y * h;
    switch (s.kind) {
      case 'line':
      case 'dashed':
      case 'arrow': {
        if (s.kind === 'dashed') ctx.setLineDash([s.width * unit * 2.5, s.width * unit * 2]);
        ctx.beginPath();
        ctx.moveTo(X(s.x1), Y(s.y1));
        ctx.lineTo(X(s.x2), Y(s.y2));
        ctx.stroke();
        ctx.setLineDash([]);
        if (s.kind !== 'line') {
          const ang = Math.atan2(Y(s.y2) - Y(s.y1), X(s.x2) - X(s.x1));
          const len = Math.max(10 * unit, s.width * unit * 4);
          ctx.beginPath();
          ctx.moveTo(X(s.x2), Y(s.y2));
          ctx.lineTo(X(s.x2) - len * Math.cos(ang - 0.45), Y(s.y2) - len * Math.sin(ang - 0.45));
          ctx.lineTo(X(s.x2) - len * Math.cos(ang + 0.45), Y(s.y2) - len * Math.sin(ang + 0.45));
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'circle': {
        ctx.beginPath();
        ctx.ellipse(X(s.cx), Y(s.cy), Math.abs(s.rx * w), Math.abs(s.ry * h), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.15;
        ctx.fill();
        break;
      }
      case 'free':
      case 'zone': {
        if (s.points.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(X(s.points[0][0]), Y(s.points[0][1]));
        for (const [x, y] of s.points.slice(1)) ctx.lineTo(X(x), Y(y));
        if (s.kind === 'zone') {
          ctx.closePath();
          ctx.globalAlpha = 0.25;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.stroke();
        break;
      }
      case 'text': {
        const size = Math.max(12, s.width * unit * 6);
        ctx.font = `700 ${size}px system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        const m = ctx.measureText(s.text);
        const pad = size * 0.35;
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(8,14,28,.82)';
        ctx.fillRect(X(s.x) - pad, Y(s.y) - size * 0.7, m.width + pad * 2, size * 1.4);
        ctx.fillStyle = s.color;
        ctx.fillText(s.text, X(s.x), Y(s.y));
        break;
      }
    }
    ctx.restore();
  }
}

/** Fit a media frame of size (mw, mh) inside a box (bw, bh) like object-fit: contain. */
export function containRect(mw: number, mh: number, bw: number, bh: number) {
  if (!mw || !mh) return { x: 0, y: 0, w: bw, h: bh };
  const scale = Math.min(bw / mw, bh / mh);
  const w = mw * scale;
  const h = mh * scale;
  return { x: (bw - w) / 2, y: (bh - h) / 2, w, h };
}
