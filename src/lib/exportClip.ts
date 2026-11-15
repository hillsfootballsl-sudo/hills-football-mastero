import type { Clip } from '../db';
import { renderShapes } from './draw';

export function exportMime() {
  const opts = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return opts.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
}

export function canExport() {
  return typeof MediaRecorder !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype && !!exportMime();
}

interface Opts {
  caption?: boolean;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
}

/**
 * Renders a clip (video + freeze-frame drawings + optional caption) to a new video file.
 * Runs in real time: the clip plays through an off-screen canvas that MediaRecorder captures.
 */
export async function exportClip(clip: Clip, videoUrl: string, { caption = true, onProgress, signal }: Opts = {}): Promise<Blob> {
  const video = document.createElement('video');
  video.src = videoUrl;
  video.playsInline = true;
  video.preload = 'auto';
  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error('Could not read the video'));
  });

  const scale = Math.min(1, 1920 / video.videoWidth);
  const W = Math.round((video.videoWidth * scale) / 2) * 2;
  const H = Math.round((video.videoHeight * scale) / 2) * 2;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Route audio into the recording without playing it through the speakers.
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const actx = new AC();
  const dest = actx.createMediaStreamDestination();
  try {
    actx.createMediaElementSource(video).connect(dest);
  } catch {
    /* no audio track */
  }

  const stream = canvas.captureStream(30);
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const mimeType = exportMime();
  const mr = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const drawings = [...clip.drawings].filter((d) => d.time >= clip.start && d.time <= clip.end).sort((a, b) => a.time - b.time);
  const totalHold = drawings.reduce((s, d) => s + d.hold, 0);
  const totalLen = clip.end - clip.start + totalHold;

  video.currentTime = clip.start;
  await new Promise((r) => (video.onseeked = r));
  await actx.resume();

  let nextDrawing = 0;
  let freeze: { until: number; shapes: (typeof drawings)[number]['shapes'] } | null = null;
  let heldSoFar = 0;
  const startedAt = performance.now();

  const paintCaption = (elapsed: number) => {
    if (!caption || elapsed > 4) return;
    const alpha = elapsed < 3.5 ? 1 : (4 - elapsed) / 0.5;
    const pad = H * 0.03;
    const fs = Math.round(H * 0.045);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    const sub = clip.objective || clip.teachingPoint;
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    const w1 = ctx.measureText(clip.title).width;
    ctx.font = `500 ${Math.round(fs * 0.7)}px system-ui, sans-serif`;
    const w2 = sub ? ctx.measureText(sub).width : 0;
    const bw = Math.min(W - pad * 2, Math.max(w1, w2) + pad * 2);
    const bh = fs * (sub ? 2.3 : 1.5);
    const y = H - bh - pad * 1.5;
    ctx.fillStyle = 'rgba(8,14,28,.85)';
    ctx.fillRect(pad, y, bw, bh);
    ctx.fillStyle = '#c8f04a';
    ctx.fillRect(pad, y, Math.max(4, H * 0.008), bh);
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(clip.title, pad * 1.8, y + fs * 0.25, bw - pad * 1.2);
    if (sub) {
      ctx.fillStyle = '#c8f04a';
      ctx.font = `500 ${Math.round(fs * 0.7)}px system-ui, sans-serif`;
      ctx.fillText(sub, pad * 1.8, y + fs * 1.35, bw - pad * 1.2);
    }
    ctx.restore();
  };

  return new Promise<Blob>((resolve, reject) => {
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      video.pause();
      if (mr.state !== 'inactive') mr.stop();
      mr.onstop = () => {
        actx.close().catch(() => {});
        stream.getTracks().forEach((t) => t.stop());
        if (err) reject(err);
        else resolve(new Blob(chunks, { type: (mr.mimeType || mimeType || 'video/webm').split(';')[0] }));
      };
    };
    signal?.addEventListener('abort', () => finish(new DOMException('Export cancelled', 'AbortError')));

    const loop = () => {
      if (done) return;
      const now = performance.now();
      const elapsed = (now - startedAt) / 1000;
      if (freeze) {
        if (now >= freeze.until) {
          freeze = null;
          video.play().catch(finish);
        }
      } else if (nextDrawing < drawings.length && video.currentTime >= drawings[nextDrawing].time) {
        const d = drawings[nextDrawing++];
        video.pause();
        freeze = { until: now + d.hold * 1000, shapes: d.shapes };
        heldSoFar += d.hold;
      }
      ctx.drawImage(video, 0, 0, W, H);
      if (freeze) renderShapes(ctx, freeze.shapes, W, H);
      paintCaption(elapsed);
      const progress = (video.currentTime - clip.start + (heldSoFar - (freeze ? Math.max(0, (freeze.until - now) / 1000) : 0))) / totalLen;
      onProgress?.(Math.max(0, Math.min(1, progress)));
      if (!freeze && (video.currentTime >= clip.end || video.ended)) {
        finish();
        return;
      }
      requestAnimationFrame(loop);
    };

    mr.start(1000);
    video
      .play()
      .then(() => requestAnimationFrame(loop))
      .catch((e) => finish(e));
  });
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Opens the system share sheet (WhatsApp etc.) when the device supports sharing files. */
export async function shareFile(blob: Blob, name: string, text: string): Promise<boolean> {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name, text });
      return true;
    } catch {
      return true; // user cancelled
    }
  }
  return false;
}
