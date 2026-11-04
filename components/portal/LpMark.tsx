'use client';
import { useEffect, useRef } from 'react';

// Lost Property's AI mark: four 4px pixels working inside the footprint of the LP monogram (a 4:1 parallelogram
// with the monogram's slant). The letters are never drawn. Resting: one pixel on each corner. Scanning: a 2×2 block
// sweeps along the slant (thinking). Contouring: the four step corner to corner around the shape (writing).
// Pulsing: the corners breathe in turn (done). Orbiting and swapping are there for longer tasks and searches.

export type MarkState = 'rest' | 'scan' | 'contour' | 'pulse' | 'orbit' | 'swap';
export const LP_PINK = '#F28EE8';
const W = 40, H = 10, D = 4, S = 4;
const pt = (a: number, b: number): [number, number] => [Math.round(a * (W - D - S) + (1 - b) * S), Math.round(b * (H - D))];
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const C: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const around = (p: number): [number, number] => { p = ((p % 4) + 4) % 4; const i = Math.floor(p), f = p - i; const [a1, b1] = C[i], [a2, b2] = C[(i + 1) % 4]; return [a1 + (a2 - a1) * f, b1 + (b2 - b1) * f]; };

export function markFrame(mode: MarkState, t: number): [number, number, number][] {
  if (mode === 'scan') { const d = 6 / (W - D - S); const c = (t / 1.6) % 2; const a = ease(c < 1 ? c : 2 - c) * (1 - d); return ([[a, 0], [a + d, 0], [a, 1], [a + d, 1]] as [number, number][]).map(([x, y]) => [...pt(x, y), 1]); }
  if (mode === 'contour') { const step = 0.62; const k = Math.floor(t / step), f = Math.min(1, (t % step) / step / 0.55); return [0, 1, 2, 3].map((i) => [...pt(...around(i + k + ease(f))), 1]); }
  if (mode === 'pulse') return C.map(([a, b], i) => [...pt(a, b), 0.2 + 0.8 * Math.pow((Math.sin((t * Math.PI * 2) / 1.4 - (i * Math.PI) / 2) + 1) / 2, 1.6)]);
  if (mode === 'orbit') return [0, 1, 2, 3].map((i) => [...pt(...around(i + t / 1.1)), 1]);
  if (mode === 'swap') {
    const seg = 0.9, k = Math.floor(t / seg), f = ease(Math.min(1, (t % seg) / seg / 0.6));
    const pos = [0, 1, 2, 3];
    for (let j = 0; j < k % 4; j++) { const pair = j % 2 ? [1, 3] : [0, 2]; for (let d = 0; d < 4; d++) if (pair.includes(pos[d])) pos[d] = pos[d] === pair[0] ? pair[1] : pair[0]; }
    const pair = k % 2 ? [1, 3] : [0, 2];
    return [0, 1, 2, 3].map((d) => { const from = C[pos[d]]; if (!pair.includes(pos[d])) return [...pt(...from), 1]; const to = C[pos[d] === pair[0] ? pair[1] : pair[0]]; return [...pt(from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f), 1]; });
  }
  return C.map(([a, b]) => [...pt(a, b), 1]);
}

export function LpMark({ state = 'rest', colour = LP_PINK, scale = 1, title }: { state?: MarkState; colour?: string; scale?: number; title?: string }) {
  const rects = useRef<(SVGRectElement | null)[]>([]);
  useEffect(() => {
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const set = (t: number) => markFrame(state, t).forEach(([x, y, o], i) => { const r = rects.current[i]; if (r) { r.setAttribute('x', String(x)); r.setAttribute('y', String(y)); r.setAttribute('opacity', o.toFixed(3)); } });
    if (state === 'rest' || reduce) { set(state === 'pulse' ? 0.35 : 0); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (now: number) => { set((now - t0) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);
  const start = markFrame('rest', 0);
  return <svg className="lp-mark" viewBox={`0 0 ${W} ${H}`} width={W * scale} height={H * scale} shapeRendering="crispEdges" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
    {start.map(([x, y], i) => <rect key={i} ref={(el) => { rects.current[i] = el; }} x={x} y={y} width={D} height={D} fill={colour} />)}
  </svg>;
}
