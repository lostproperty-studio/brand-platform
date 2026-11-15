// Brand motion: how a client's logos and type move. Set by the studio in the Motion tab (with Claude's help), saved on
// the project, and used everywhere the brand moves: the motion logo package in Resources, and Director. Pure data and
// timing, safe on the server and in the browser. Drawing and file writing are in lib/motion/render.ts.
//
// The first behaviour comes from Lost Property's Tileyard motion kit: each part of the logo wipes in from one side,
// staggered, while the whole logo drifts into place, Expo out, then mirrors on the way out. Every timing is set for a
// reference length and scales with the length chosen, so a 3 s version keeps the same character as the 2 s one.

export type Ease = [number, number, number, number];
export type Build = 'wipe' | 'fade' | 'rise' | 'scale' | 'none';
export type Side = 'left' | 'right' | 'top' | 'bottom';
export type Split = 'whole' | 'parts';
export type Order = 'left' | 'right' | 'centre' | 'top';
export type Out = 'none' | 'mirror' | 'fade';

export type MotionPreset = {
  /** How each part arrives */
  build: Build;
  /** Where a wipe starts (wipe from left reveals left to right), or where a rise comes from */
  from: Side;
  /** The logo as one piece, or its parts one after another */
  split: Split;
  /** The order parts go in */
  order: Order;
  /** Running time in seconds */
  length: number;
  /** Each part's build, in ms, at the reference length */
  wipe: number;
  /** Time between parts, in ms, at the reference length */
  stagger: number;
  /** Wait before the first part, in ms, at the reference length */
  delay: number;
  /** How far the whole logo drifts while it builds, as a % of its width (0 = still) */
  drift: number;
  /** Which way it drifts */
  driftTo: Side;
  /** The ease, as a CSS cubic-bezier */
  ease: Ease;
  /** How it leaves: not at all, the build reversed, or a fade */
  out: Out;
  /** Size in the frame, as a % of its width */
  scale: number;
  /** The length the timings were set at */
  refLength: number;
};

/** Type: the same behaviour, split into lines, words or letters */
export type TypeSplit = 'whole' | 'lines' | 'words' | 'letters';
export type TypePreset = Omit<MotionPreset, 'split' | 'scale'> & { split: TypeSplit };

export type BrandMotion = {
  logo: MotionPreset;
  /** Changes for one logo file (by its path), where it needs its own timing or split */
  perLogo?: Record<string, Partial<MotionPreset>>;
  type: TypePreset;
  /** Notes from the studio on why it moves this way */
  note?: string;
  updatedAt?: string;
  /** The last motion package build */
  builtAt?: string;
};

export const EASES: { id: string; label: string; ease: Ease }[] = [
  { id: 'expo-out', label: 'Expo out', ease: [0.16, 1, 0.3, 1] },
  { id: 'quart-out', label: 'Quart out', ease: [0.25, 1, 0.5, 1] },
  { id: 'cubic-out', label: 'Cubic out', ease: [0.33, 1, 0.68, 1] },
  { id: 'sine-in-out', label: 'Sine in-out', ease: [0.37, 0, 0.63, 1] },
  { id: 'expo-in-out', label: 'Expo in-out', ease: [0.87, 0, 0.13, 1] },
  { id: 'back-out', label: 'Back out', ease: [0.34, 1.56, 0.64, 1] },
  { id: 'linear', label: 'Linear', ease: [0, 0, 1, 1] }
];
export const easeName = (e: Ease) => EASES.find((x) => x.ease.every((n, i) => Math.abs(n - e[i]) < 1e-3))?.label || `cubic-bezier(${e.join(', ')})`;

/** Lost Property's starting point: the Tileyard wipe and drift */
export const DEFAULT_LOGO: MotionPreset = { build: 'wipe', from: 'left', split: 'parts', order: 'left', length: 2, wipe: 790, stagger: 100, delay: 0, drift: 10, driftTo: 'right', ease: [0.16, 1, 0.3, 1], out: 'mirror', scale: 48, refLength: 2 };
export const DEFAULT_TYPE: TypePreset = { build: 'wipe', from: 'left', split: 'words', order: 'left', length: 2.4, wipe: 640, stagger: 90, delay: 0, drift: 4, driftTo: 'right', ease: [0.16, 1, 0.3, 1], out: 'mirror', refLength: 2.4 };

export function readMotion(content: unknown): BrandMotion {
  const m = (content as { motion?: Partial<BrandMotion> } | null)?.motion || {};
  return { ...m, logo: { ...DEFAULT_LOGO, ...(m.logo || {}) }, type: { ...DEFAULT_TYPE, ...(m.type || {}) }, perLogo: m.perLogo || {} };
}
/** The behaviour for one logo: the brand's, with that logo's own changes */
export const presetFor = (m: BrandMotion, path?: string): MotionPreset => ({ ...m.logo, ...(path ? m.perLogo?.[path] || {} : {}) });

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const pick = <T extends string>(v: unknown, list: readonly T[], d: T) => (list.includes(v as T) ? (v as T) : d);
/** Keeps a preset inside sensible limits, whatever it came from (the studio's sliders, Claude, an old save) */
export function cleanPreset<P extends MotionPreset | TypePreset>(p: Partial<P>, base: P): P {
  const e = Array.isArray(p.ease) && p.ease.length === 4 && p.ease.every((n) => typeof n === 'number' && isFinite(n)) ? p.ease : base.ease;
  const out = {
    ...base,
    build: pick(p.build, ['wipe', 'fade', 'rise', 'scale', 'none'] as const, base.build),
    from: pick(p.from, ['left', 'right', 'top', 'bottom'] as const, base.from),
    order: pick(p.order, ['left', 'right', 'centre', 'top'] as const, base.order),
    length: num(p.length, 0.6, 8, base.length), wipe: num(p.wipe, 40, 4000, base.wipe), stagger: num(p.stagger, 0, 1500, base.stagger), delay: num(p.delay, 0, 3000, base.delay),
    drift: num(p.drift, 0, 40, base.drift), driftTo: pick(p.driftTo, ['left', 'right', 'top', 'bottom'] as const, base.driftTo),
    ease: [num(e[0], 0, 1, 0.16), num(e[1], -1, 2, 1), num(e[2], 0, 1, 0.3), num(e[3], -1, 2, 1)] as Ease,
    out: pick(p.out, ['none', 'mirror', 'fade'] as const, base.out), refLength: num(p.refLength, 0.6, 8, base.refLength)
  } as P;
  if ('scale' in base) (out as MotionPreset).scale = num((p as Partial<MotionPreset>).scale, 8, 100, (base as MotionPreset).scale);
  (out as { split: string }).split = 'scale' in base ? pick((p as Partial<MotionPreset>).split, ['whole', 'parts'] as const, (base as MotionPreset).split) : pick((p as Partial<TypePreset>).split, ['whole', 'lines', 'words', 'letters'] as const, (base as TypePreset).split);
  return out;
}

// ---------- Timing

export function bezier(x1: number, y1: number, x2: number, y2: number) {
  if (x1 === y1 && x2 === y2) return (t: number) => t;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; if (Math.abs(e) < 1e-6) return sy(t); const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 40; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-6) break; if (x > v) lo = t; else hi = t; t = (lo + hi) / 2; }
    return sy(t);
  };
}
/** The way out mirrors the way in, so an ease-out arrival leaves with an ease-in */
export const mirrorEase = (e: Ease): Ease => [1 - e[2], 1 - e[3], 1 - e[0], 1 - e[1]].map((n) => +n.toFixed(3)) as Ease;

/** A value over time: keyframes in ms, each eased from the one before */
export type Key = { t: number; v: number; e: Ease | null };
export class Track {
  k: Key[]; private f: ((x: number) => number)[] = [];
  constructor(v: number) { this.k = [{ t: 0, v, e: null }]; this.f = [(x) => x]; }
  get last() { return this.k[this.k.length - 1]; }
  to(t: number, v: number, e?: Ease) {
    const L = this.last;
    if (t <= L.t + 1e-6) { L.v = v; return this; }
    this.k.push({ t, v, e: e || null }); this.f.push(e ? bezier(...e) : (x) => x);
    return this;
  }
  end(T: number) { if (T > this.last.t + 1e-6) this.to(T, this.last.v); return this; }
  at(t: number) {
    const k = this.k;
    if (t <= k[0].t) return k[0].v;
    for (let i = 1; i < k.length; i++) if (t < k[i].t) { const A = k[i - 1], B = k[i]; return A.v + (B.v - A.v) * this.f[i]((t - A.t) / (B.t - A.t)); }
    return k[k.length - 1].v;
  }
  ease(i: number) { return this.f[i]; }
  get moving() { return this.k.some((x) => x.v !== this.k[0].v); }
}

/** A part of the thing that moves: its box, in the logo's own units */
export type Rect = [number, number, number, number];
export type PartTimeline = { r: Rect; rank: number;
  /** Visible share of the part along the wipe, start and end (0..1) */ a: Track; b: Track;
  /** Opacity, offset (as a share of the part's size) and scale */ o: Track; off: Track; s: Track;
  spans: { in: [number, number]; out: [number, number] | null } };
export type Timeline = { T: number; parts: PartTimeline[]; driftX: Track; driftY: Track; hold: number; wipe: number; stagger: number; w: number; h: number };

const sortParts = (rects: Rect[], order: Order, w: number, h: number) => {
  const c = (r: Rect) => [r[0] + r[2] / 2, r[1] + r[3] / 2];
  const key = (r: Rect) => order === 'left' ? r[0] * 10 + r[1] / h : order === 'right' ? -(r[0] + r[2]) * 10 + r[1] / h : order === 'top' ? r[1] * 10 + r[0] / w : Math.hypot(c(r)[0] - w / 2, c(r)[1] - h / 2);
  return rects.map((r, i) => ({ r, i })).sort((x, y) => key(x.r) - key(y.r));
};

/** Every part's timing for a preset. Parts are boxes in the artwork's units; w and h are the artwork's size. */
export function buildTimeline(P: MotionPreset | TypePreset, rects: Rect[], w: number, h: number): Timeline {
  const whole = (P as MotionPreset).split === 'whole' || (P as TypePreset).split === 'whole' || !rects.length;
  const list = whole ? [{ r: [0, 0, w, h] as Rect, i: 0 }] : sortParts(rects, P.order, w, h);
  const n = list.length;
  const total = Math.min(8000, Math.max(600, P.length * 1000));
  const k = total / (P.refLength * 1000);
  let D = P.wipe * k, st = P.stagger * k; const delay = P.delay * k;
  const out = P.out !== 'none';
  // Squeeze the build if the parts wouldn't fit the length
  const need = delay + ((n - 1) * st + D) * (out ? 2 : 1);
  if (need > total) { const f = (total - delay) / (((n - 1) * st + D) * (out ? 2 : 1)); D *= f; st *= f; }
  const E = P.ease, Eo = mirrorEase(E);
  const inStart = delay, inEnd = inStart + (n - 1) * st + D;
  const hold = Math.max(0, total - inEnd - (out ? (n - 1) * st + D : 0));
  const outStart = inEnd + hold, outEnd = outStart + (n - 1) * st + D;
  const horiz = P.driftTo === 'left' || P.driftTo === 'right';
  const dist = (P.drift / 100) * (horiz ? w : h) * (P.driftTo === 'left' || P.driftTo === 'top' ? -1 : 1);
  const dx = new Track(horiz ? -dist : 0), dy = new Track(horiz ? 0 : -dist);
  const driftOut = out && P.out === 'mirror';
  dx.to(inStart, horiz ? -dist : 0).to(inEnd, 0, E); dy.to(inStart, horiz ? 0 : -dist).to(inEnd, 0, E);
  if (driftOut) { dx.to(outStart, 0).to(outEnd, horiz ? dist : 0, Eo); dy.to(outStart, 0).to(outEnd, horiz ? 0 : dist, Eo); }
  dx.end(total); dy.end(total);

  const parts = list.map(({ r }, R) => {
    const t0 = inStart + R * st, te = outStart + R * st;
    const a = new Track(0), b = new Track(P.build === 'wipe' ? 0 : 1), o = new Track(P.build === 'none' ? 1 : P.build === 'wipe' ? 1 : 0), off = new Track(P.build === 'rise' ? 1 : 0), s = new Track(P.build === 'scale' ? 0.6 : 1);
    if (P.build === 'wipe') { b.to(t0, 0).to(t0 + D, 1, E); }
    if (P.build === 'fade' || P.build === 'rise' || P.build === 'scale') { o.to(t0, 0).to(t0 + D * 0.7, 1, E); }
    if (P.build === 'rise') off.to(t0, 1).to(t0 + D, 0, E);
    if (P.build === 'scale') s.to(t0, 0.6).to(t0 + D, 1, E);
    if (out) {
      if (P.out === 'fade') o.to(te, 1).to(te + D, 0, Eo);
      else if (P.build === 'wipe') a.to(te, 0).to(te + D, 1, Eo);
      else if (P.build === 'rise') { off.to(te, 0).to(te + D, -1, Eo); o.to(te + D * 0.3, 1).to(te + D, 0, Eo); }
      else if (P.build === 'scale') { s.to(te, 1).to(te + D, 0.6, Eo); o.to(te + D * 0.3, 1).to(te + D, 0, Eo); }
      else if (P.build === 'fade') o.to(te, 1).to(te + D, 0, Eo);
      else o.to(te + D - 1, 1).to(te + D, 0);
    }
    [a, b, o, off, s].forEach((x) => x.end(total));
    return { r, rank: R, a, b, o, off, s, spans: { in: [t0, t0 + D] as [number, number], out: out ? [te, te + D] as [number, number] : null } };
  });
  return { T: total, parts, driftX: dx, driftY: dy, hold, wipe: D, stagger: st, w, h };
}

/** Where one part is at time t: the box to show (in artwork units), and its opacity, offset and scale */
export function partAt(P: MotionPreset | TypePreset, p: PartTimeline, t: number) {
  const [x, y, w, h] = p.r;
  const a = p.a.at(t), b = p.b.at(t);
  let clip: Rect = [x, y, w, h];
  if (P.build === 'wipe') {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    // A wipe from the right or bottom runs the other way
    if (P.from === 'left') clip = [x + lo * w, y, (hi - lo) * w, h];
    else if (P.from === 'right') clip = [x + (1 - hi) * w, y, (hi - lo) * w, h];
    else if (P.from === 'top') clip = [x, y + lo * h, w, (hi - lo) * h];
    else clip = [x, y + (1 - hi) * h, w, (hi - lo) * h];
  }
  const off = p.off.at(t);
  const ox = P.from === 'left' ? -off * w * 0.4 : P.from === 'right' ? off * w * 0.4 : 0;
  const oy = P.from === 'top' ? -off * h * 0.6 : P.from === 'bottom' || (P.from !== 'left' && P.from !== 'right') ? off * h * 0.6 : 0;
  return { clip, opacity: p.o.at(t), dx: P.build === 'rise' ? ox : 0, dy: P.build === 'rise' ? oy : 0, scale: p.s.at(t) };
}

/** A short line on what a preset does, for lists and for Claude */
export function describe(P: MotionPreset | TypePreset) {
  const split = (P as MotionPreset).split === 'parts' ? 'part by part' : (P as TypePreset).split && (P as TypePreset).split !== 'whole' ? `${(P as TypePreset).split} one by one` : 'as one piece';
  const build = P.build === 'wipe' ? `wipes in from the ${P.from}` : P.build === 'rise' ? `rises in from the ${P.from}` : P.build === 'none' ? 'cuts in' : `${P.build}s in`;
  return `${build[0].toUpperCase() + build.slice(1)}, ${split}${P.drift ? `, drifting ${P.drift}% to the ${P.driftTo}` : ''}, ${easeName(P.ease)}, ${P.length} s${P.out === 'mirror' ? ', then reverses out' : P.out === 'fade' ? ', then fades out' : ''}.`;
}
