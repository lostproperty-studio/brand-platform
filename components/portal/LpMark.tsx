'use client';
import { useEffect, useRef } from 'react';

// Lost Property's AI mark: four small round pixels working inside a parallelogram drawn from the LP monogram's
// slant, its sides as long as it is tall. The letters are never drawn. Resting: one pixel on each corner. Scanning: the four stack
// down the slant and sweep left and right, each a beat behind the last, dimming at the turns (thinking). Contouring: the four step corner to corner around the shape (writing).
// Pulsing: the corners breathe in turn (done). Orbiting and swapping are there for longer tasks and searches.

export type MarkState = 'rest' | 'scan' | 'contour' | 'pulse' | 'orbit' | 'swap';
export const LP_PINK = '#F28EE8';
/** A deeper pink for light grounds, so 3px dots read on white (3.7:1); the light pink stays for dark grounds */
export const LP_PINK_DEEP = '#D64BC9';
const W = 23, H = 16, D = 3, S = 5;
const half = (n: number) => Math.round(n * 2) / 2;
const pt = (a: number, b: number): [number, number] => [half(a * (W - D - S) + (1 - b) * S), half(b * (H - D))];
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const C: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const around = (p: number): [number, number] => { p = ((p % 4) + 4) % 4; const i = Math.floor(p), f = p - i; const [a1, b1] = C[i], [a2, b2] = C[(i + 1) % 4]; return [a1 + (a2 - a1) * f, b1 + (b2 - b1) * f]; };

// Each motion runs at its own pace so they all feel equally quick: contouring a touch slower (it travels a
// corner at a time), orbiting a touch faster (it never pauses)
export const MARK_PACE: Record<MarkState, number> = { rest: 1, scan: 1.5, contour: 1.2, pulse: 1.5, orbit: 1.9, swap: 1.5 };

export function markFrame(mode: MarkState, t: number): [number, number, number][] {
  t *= MARK_PACE[mode];
  if (mode === 'scan') return [0, 1, 2, 3].map((i): [number, number, number] => { const c = (((t - i * 0.14) / 1.5) % 2 + 2) % 2; const a = ease(c < 1 ? c : 2 - c); return [pt(a, i / 3)[0], (i * (H - D)) / 3, 0.3 + 0.7 * Math.pow(Math.sin(Math.PI * a), 0.7)]; });
  if (mode === 'contour') { const step = 0.62; const k = Math.floor(t / step), f = Math.min(1, (t % step) / step / 0.55); return [0, 1, 2, 3].map((i) => [...pt(...around(i + k + ease(f))), 1]); }
  if (mode === 'pulse') return C.map(([a, b], i) => [...pt(a, b), 0.2 + 0.8 * Math.pow((Math.sin((t * Math.PI * 2) / 1.4 - (i * Math.PI) / 2) + 1) / 2, 1.6)]);
  // Orbiting: a smooth glide that eases into each corner and out again, never stopping (speed dips to a third at
  // the corners and swells along the edges, with no jolt)
  if (mode === 'orbit') { const u = t / 1.1, f = u - Math.floor(u); const p = Math.floor(u) + f - (0.67 * Math.sin(2 * Math.PI * f)) / (2 * Math.PI); return [0, 1, 2, 3].map((i) => [...pt(...around(i + p)), 1]); }
  if (mode === 'swap') {
    const seg = 0.9, k = Math.floor(t / seg), f = ease(Math.min(1, (t % seg) / seg / 0.6));
    const pos = [0, 1, 2, 3];
    for (let j = 0; j < k % 4; j++) { const pair = j % 2 ? [1, 3] : [0, 2]; for (let d = 0; d < 4; d++) if (pair.includes(pos[d])) pos[d] = pos[d] === pair[0] ? pair[1] : pair[0]; }
    const pair = k % 2 ? [1, 3] : [0, 2];
    return [0, 1, 2, 3].map((d) => { const from = C[pos[d]]; if (!pair.includes(pos[d])) return [...pt(...from), 1]; const to = C[pos[d] === pair[0] ? pair[1] : pair[0]]; return [...pt(from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f), 1]; });
  }
  return C.map(([a, b]) => [...pt(a, b), 1]);
}

// Moving between states: the dots get into formation quickly (each to its nearest place in the new motion, so
// none cross), then the new motion starts from exactly there.
const FORM = 0.24; // seconds to get into formation
const PERMS: number[][] = (() => { const out: number[][] = []; const go = (a: number[], rest: number[]) => { if (!rest.length) out.push(a); else rest.forEach((x, i) => go([...a, x], rest.filter((_, j) => j !== i))); }; go([], [0, 1, 2, 3]); return out; })();
const settle = (x: number) => 1 - Math.pow(1 - x, 3);
type Dot = [number, number, number];

export function LpMark({ state = 'rest', ground = 'light', colour, scale = 1, title }: { state?: MarkState; ground?: 'light' | 'dark'; colour?: string; scale?: number; title?: string }) {
  const fill = colour || (ground === 'dark' ? LP_PINK : LP_PINK_DEEP);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const now = useRef<Dot[]>(markFrame('rest', 0));
  useEffect(() => {
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = (f: Dot[]) => { now.current = f; f.forEach(([x, y, o], i) => { const r = dots.current[i]; if (r) { r.setAttribute('cx', String(x + D / 2)); r.setAttribute('cy', String(y + D / 2)); r.setAttribute('opacity', o.toFixed(3)); } }); };
    const still = state === 'rest' || reduce;
    const first = markFrame(state, 0);
    // Which dot takes which place: the arrangement with the least travel
    const from = now.current;
    const perm = PERMS.reduce((best, p) => { const cost = (q: number[]) => q.reduce((n, k, i) => n + (from[i][0] - first[k][0]) ** 2 + (from[i][1] - first[k][1]) ** 2, 0); return cost(p) < cost(best) ? p : best; }, PERMS[0]);
    const at = (t: number) => { const f = markFrame(state, t); return perm.map((k) => f[k]); };
    if (reduce) { draw(at(state === 'pulse' ? 0.35 : 0)); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (ms: number) => {
      const t = (ms - t0) / 1000;
      if (t < FORM) {
        const k = settle(t / FORM), to = at(0);
        draw(from.map(([x, y, o], i) => [x + (to[i][0] - x) * k, y + (to[i][1] - y) * k, o + (to[i][2] - o) * k]));
      } else {
        draw(at(t - FORM));
        if (still) return; // resting: in place, nothing more to do
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);
  const start = markFrame('rest', 0);
  return <svg className="lp-mark" viewBox={`0 0 ${W} ${H}`} width={W * scale} height={H * scale} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
    {start.map(([x, y], i) => <circle key={i} ref={(el) => { dots.current[i] = el; }} cx={x + D / 2} cy={y + D / 2} r={D / 2} fill={fill} />)}
  </svg>;
}
