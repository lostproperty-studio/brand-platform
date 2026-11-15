// Brand motion in the browser: reads a logo's SVG into parts, draws any frame of its animation, and writes the files
// for the motion package: MP4 on a brand colour, transparent WebM, Lottie and animated SVG. The same drawing is used
// for the Motion tab's preview, the package and Director, so what the studio approves is what clients get.
// Browser only (it needs the DOM and canvas).

import { buildTimeline, partAt, type MotionPreset, type Rect, type Timeline, type TypePreset } from '@/lib/motion/model';

export type Artwork = { svg: string; inner: string; vb: [number, number, number, number]; w: number; h: number; rects: Rect[]; img: HTMLImageElement; tone: 'dark' | 'light' };
type P = MotionPreset | TypePreset;

const DRAWABLE = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'text', 'use', 'image', 'g']);

/** Reads a logo: its size, the boxes of its parts (separate shapes, with anything inside another shape counted with it),
 *  whether it's dark or light, and an image of it to draw with. */
export async function loadArtwork(svgText: string): Promise<Artwork> {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement as unknown as SVGSVGElement;
  if (root.nodeName.toLowerCase() !== 'svg') throw new Error('That isn’t an SVG.');
  const vbA = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const W0 = parseFloat(root.getAttribute('width') || '') || vbA[2] || 100, H0 = parseFloat(root.getAttribute('height') || '') || vbA[3] || 100;
  const vb: [number, number, number, number] = vbA.length === 4 && vbA.every(isFinite) ? [vbA[0], vbA[1], vbA[2], vbA[3]] : [0, 0, W0, H0];
  const [, , w, h] = vb;
  root.setAttribute('viewBox', vb.join(' ')); root.setAttribute('width', String(w)); root.setAttribute('height', String(h)); root.setAttribute('preserveAspectRatio', 'none');
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const svg = new XMLSerializer().serializeToString(root);
  const inner = [...root.childNodes].map((n) => new XMLSerializer().serializeToString(n)).join('');

  // Measure the parts in the page, one unit to one pixel
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${w}px;height:${h}px;visibility:hidden;pointer-events:none`;
  host.innerHTML = svg; document.body.appendChild(host);
  const el = host.querySelector('svg')!;
  let level = [...el.children].filter((c) => DRAWABLE.has(c.tagName.toLowerCase()));
  while (level.length === 1 && level[0].tagName.toLowerCase() === 'g') level = [...level[0].children].filter((c) => DRAWABLE.has(c.tagName.toLowerCase()));
  const o = el.getBoundingClientRect();
  let rects: Rect[] = level.map((c) => { const r = c.getBoundingClientRect(); return [r.left - o.left, r.top - o.top, r.width, r.height] as Rect; }).filter((r) => r[2] > 0.5 && r[3] > 0.5);
  // A dark or light logo, from the fill used most
  const fills = [...el.querySelectorAll('*')].map((c) => getComputedStyle(c).fill).filter((f) => f && f !== 'none' && f.startsWith('rgb'));
  host.remove();
  const lum = (c: string) => { const m = c.match(/[\d.]+/g)?.map(Number) || [0, 0, 0]; return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
  const avg = fills.length ? fills.reduce((n, f) => n + lum(f), 0) / fills.length : 0;
  // Anything inside another part moves with it (letters cut into a tile, a dot on an i)
  const inside = (a: Rect, b: Rect) => a[0] >= b[0] - 0.5 && a[1] >= b[1] - 0.5 && a[0] + a[2] <= b[0] + b[2] + 0.5 && a[1] + a[3] <= b[1] + b[3] + 0.5;
  rects = rects.filter((r, i) => !rects.some((b, j) => j !== i && inside(r, b) && !(inside(b, r) && j > i)));
  // Very detailed logos move in columns rather than dozens of tiny pieces
  if (rects.length > 24) {
    const cols: Rect[] = [];
    for (const r of [...rects].sort((a, b) => a[0] - b[0])) {
      const c = cols[cols.length - 1];
      if (c && r[0] < c[0] + c[2] + w * 0.01) { const x2 = Math.max(c[0] + c[2], r[0] + r[2]), y1 = Math.min(c[1], r[1]), y2 = Math.max(c[1] + c[3], r[1] + r[3]); c[2] = x2 - c[0]; c[1] = y1; c[3] = y2 - y1; }
      else cols.push([...r] as Rect);
    }
    rects = cols;
  }
  const img = await svgImage(svg, w, h);
  return { svg, inner, vb, w, h, rects: rects.length ? rects : [[0, 0, w, h]], img, tone: avg > 0.55 ? 'light' : 'dark' };
}

/** An image of the SVG, drawn large so it stays sharp in 4K frames */
function svgImage(svg: string, w: number, h: number): Promise<HTMLImageElement> {
  const big = Math.max(1, 4096 / Math.max(w, h));
  const s = svg.replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1').replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1').replace('<svg', `<svg width="${Math.round(w * big)}" height="${Math.round(h * big)}"`);
  return new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error('The logo couldn’t be drawn.')); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); });
}

/** Where the artwork sits in a frame: centred, at the preset's size, never taller than 80% of the frame */
export function placement(art: { w: number; h: number }, W: number, H: number, scalePct: number) {
  const s = Math.min((scalePct / 100) * W / art.w, 0.8 * H / art.h);
  return { s, ox: (W - art.w * s) / 2, oy: (H - art.h * s) / 2 };
}

/** Draws the frame at time t (ms). bg null leaves it transparent. */
export function drawFrame(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, W: number, H: number, art: Artwork, P: P, tl: Timeline, t: number, bg: string | null, place?: { s: number; ox: number; oy: number }) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
  const { s, ox, oy } = place || placement(art, W, H, (P as MotionPreset).scale ?? 60);
  ctx.translate(ox, oy); ctx.scale(s, s);
  ctx.translate(tl.driftX.at(t), tl.driftY.at(t));
  const px = 1 / s;
  for (const part of tl.parts) {
    const f = partAt(P, part, t);
    if (f.opacity <= 0.001 || f.clip[2] <= px * 0.25 || f.clip[3] <= px * 0.25) continue;
    const [x, y, w, h] = part.r;
    ctx.save();
    ctx.globalAlpha = f.opacity;
    if (f.dx || f.dy) ctx.translate(f.dx, f.dy);
    if (f.scale !== 1) { ctx.translate(x + w / 2, y + h / 2); ctx.scale(f.scale, f.scale); ctx.translate(-(x + w / 2), -(y + h / 2)); }
    ctx.beginPath(); ctx.rect(f.clip[0], f.clip[1], f.clip[2], f.clip[3]); ctx.clip();
    ctx.drawImage(art.img, 0, 0, art.w, art.h);
    ctx.restore();
  }
  ctx.restore();
}

// ---------- Video

const bitrateFor = (W: number, H: number, fps: number) => Math.round(W * H * fps * 0.18);
async function pickCodec(W: number, H: number, fps: number) {
  const opts: [string, 'avc' | 'vp9'][] = [['avc1.640033', 'avc'], ['avc1.640028', 'avc'], ['avc1.4d0033', 'avc'], ['avc1.42003e', 'avc'], ['vp09.00.41.08', 'vp9'], ['vp09.00.40.08', 'vp9']];
  for (const [codec, mux] of opts) { try { const r = await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate: bitrateFor(W, H, fps), framerate: fps }); if (r.supported) return { codec, mux }; } catch { /* next */ } }
  return null;
}
const canvasOf = (W: number, H: number) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H }));

export type VideoOpts = { W: number; H: number; fps: number; bg: string | null; onProgress?: (p: number) => void };

/** MP4 (H.264 where the browser can, else VP9), always on a background */
export async function encodeMp4(art: Artwork, P: P, o: VideoOpts): Promise<Blob> {
  if (typeof VideoEncoder === 'undefined') throw new Error('This browser can’t make video. Use a current Chrome or Edge.');
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  const tl = buildTimeline(P, art.rects, art.w, art.h);
  const pc = await pickCodec(o.W, o.H, o.fps);
  if (!pc) throw new Error(`This browser can’t make ${o.W} × ${o.H} video. Try Chrome.`);
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: pc.mux, width: o.W, height: o.H, frameRate: o.fps }, fastStart: 'in-memory' });
  let err: unknown = null;
  const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { err = e; } });
  enc.configure({ codec: pc.codec, width: o.W, height: o.H, bitrate: bitrateFor(o.W, o.H, o.fps), framerate: o.fps, latencyMode: 'quality' });
  const cv = canvasOf(o.W, o.H); const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const frames = Math.ceil(tl.T / 1000 * o.fps);
  for (let i = 0; i < frames; i++) {
    if (err) throw err;
    drawFrame(ctx, o.W, o.H, art, P, tl, i * 1000 / o.fps, o.bg || '#000000');
    const vf = new VideoFrame(cv as HTMLCanvasElement, { timestamp: Math.round(i * 1e6 / o.fps), duration: Math.round(1e6 / o.fps) });
    enc.encode(vf, { keyFrame: i % (o.fps * 2) === 0 }); vf.close();
    while (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 4));
    if (i % 4 === 0) { o.onProgress?.(i / frames); await new Promise((r) => setTimeout(r, 0)); }
  }
  await enc.flush(); enc.close(); muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

/** WebM with a transparent background (VP9 with alpha), to lay over footage. Encoded frame by frame where the browser
 *  can; otherwise recorded in real time from the canvas. */
export async function encodeWebm(art: Artwork, P: P, o: VideoOpts): Promise<Blob> {
  const tl = buildTimeline(P, art.rects, art.w, art.h);
  const frames = Math.ceil(tl.T / 1000 * o.fps);
  const cfg = { codec: 'vp09.00.10.08', width: o.W, height: o.H, bitrate: bitrateFor(o.W, o.H, o.fps), framerate: o.fps, alpha: 'keep' as const };
  const ok = typeof VideoEncoder !== 'undefined' && await VideoEncoder.isConfigSupported(cfg).then((r) => r.supported).catch(() => false);
  if (ok) {
    const { Muxer, ArrayBufferTarget } = await import('webm-muxer');
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'V_VP9', width: o.W, height: o.H, frameRate: o.fps, alpha: true } });
    let err: unknown = null;
    const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { err = e; } });
    enc.configure(cfg);
    const cv = canvasOf(o.W, o.H); const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
    for (let i = 0; i < frames; i++) {
      if (err) throw err;
      drawFrame(ctx, o.W, o.H, art, P, tl, i * 1000 / o.fps, null);
      const vf = new VideoFrame(cv as HTMLCanvasElement, { timestamp: Math.round(i * 1e6 / o.fps), duration: Math.round(1e6 / o.fps), alpha: 'keep' });
      enc.encode(vf, { keyFrame: i % (o.fps * 2) === 0 }); vf.close();
      while (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 4));
      if (i % 4 === 0) { o.onProgress?.(i / frames); await new Promise((r) => setTimeout(r, 0)); }
    }
    await enc.flush(); enc.close(); muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/webm' });
  }
  // Real time, from the canvas
  if (typeof MediaRecorder === 'undefined') throw new Error('This browser can’t make transparent video. Use Chrome.');
  const cv = Object.assign(document.createElement('canvas'), { width: o.W, height: o.H }); const ctx = cv.getContext('2d')!;
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';
  const rec = new MediaRecorder(cv.captureStream(o.fps), { mimeType: mime, videoBitsPerSecond: bitrateFor(o.W, o.H, o.fps) });
  const chunks: Blob[] = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<void>((r) => { rec.onstop = () => r(); });
  rec.start();
  const t0 = performance.now();
  await new Promise<void>((r) => { const step = () => { const t = performance.now() - t0; drawFrame(ctx, o.W, o.H, art, P, tl, Math.min(t, tl.T), null); o.onProgress?.(Math.min(1, t / tl.T)); if (t < tl.T + 120) requestAnimationFrame(step); else r(); }; step(); });
  rec.stop(); await done;
  return new Blob(chunks, { type: 'video/webm' });
}

// ---------- Code: animated SVG and Lottie, sampled frame by frame so every ease and behaviour comes through exactly

const r3 = (n: number) => +n.toFixed(3);
/** The frame for code files: the logo with room for its drift, or a full video frame */
export function codeFrame(art: Artwork, P: P, frame: 'logo' | { W: number; H: number }) {
  if (frame === 'logo') {
    const s = 1; const padX = (P.driftTo === 'left' || P.driftTo === 'right') ? art.w * P.drift / 100 : 0; const padY = (P.driftTo === 'top' || P.driftTo === 'bottom') ? art.h * P.drift / 100 : 0;
    return { W: Math.ceil(art.w + 2 * padX), H: Math.ceil(art.h + 2 * padY), s, ox: padX, oy: padY };
  }
  return { W: frame.W, H: frame.H, ...placement(art, frame.W, frame.H, (P as MotionPreset).scale ?? 60) };
}
function samples(T: number, fps: number) { const n = Math.max(2, Math.ceil(T / 1000 * fps)); return Array.from({ length: n + 1 }, (_, i) => Math.min(T, i * 1000 / fps)); }

export function toSVG(art: Artwork, P: P, opts: { frame: 'logo' | { W: number; H: number }; bg: string | null; loop: boolean; title: string; fps?: number }) {
  const tl = buildTimeline(P, art.rects, art.w, art.h);
  const F = codeFrame(art, P, opts.frame);
  const ts = samples(tl.T, opts.fps || 30);
  const kt = ts.map((t) => r3(t / tl.T)).join(';');
  const dur = `${r3(tl.T / 1000)}s`, rep = opts.loop ? 'repeatCount="indefinite"' : 'fill="freeze"';
  const anim = (attr: string, vals: (number | string)[]) => new Set(vals.map(String)).size > 1 ? `<animate attributeName="${attr}" dur="${dur}" ${rep} calcMode="linear" keyTimes="${kt}" values="${vals.join(';')}"/>` : '';
  const id = 'm' + Math.random().toString(36).slice(2, 7);
  let defs = `<symbol id="${id}-a" viewBox="${art.vb.join(' ')}" overflow="visible">${art.inner}</symbol>`, body = '';
  tl.parts.forEach((part, i) => {
    const fr = ts.map((t) => partAt(P, part, t));
    const f0 = fr[0];
    const cx = part.r[0] + part.r[2] / 2, cy = part.r[1] + part.r[3] / 2;
    defs += `<clipPath id="${id}-c${i}"><rect x="${r3(f0.clip[0])}" y="${r3(f0.clip[1])}" width="${r3(f0.clip[2])}" height="${r3(f0.clip[3])}">${anim('x', fr.map((f) => r3(f.clip[0])))}${anim('y', fr.map((f) => r3(f.clip[1])))}${anim('width', fr.map((f) => r3(f.clip[2])))}${anim('height', fr.map((f) => r3(f.clip[3])))}</rect></clipPath>`;
    const tr = fr.map((f) => `${r3(f.dx + cx - cx * f.scale)} ${r3(f.dy + cy - cy * f.scale)}`), sc = fr.map((f) => r3(f.scale));
    const move = new Set(tr).size > 1 ? `<animateTransform attributeName="transform" type="translate" dur="${dur}" ${rep} calcMode="linear" keyTimes="${kt}" values="${tr.join(';')}"/>` : '';
    const scale = new Set(sc.map(String)).size > 1 ? `<animateTransform attributeName="transform" type="scale" additive="sum" dur="${dur}" ${rep} calcMode="linear" keyTimes="${kt}" values="${sc.join(';')}"/>` : '';
    body += `<g opacity="${r3(f0.opacity)}">${anim('opacity', fr.map((f) => r3(f.opacity)))}<g>${move}${scale}<use href="#${id}-a" width="${r3(art.w)}" height="${r3(art.h)}" clip-path="url(#${id}-c${i})"/></g></g>`;
  });
  const dv = ts.map((t) => `${r3(tl.driftX.at(t))} ${r3(tl.driftY.at(t))}`);
  const drift = new Set(dv).size > 1 ? `<animateTransform attributeName="transform" type="translate" dur="${dur}" ${rep} calcMode="linear" keyTimes="${kt}" values="${dv.join(';')}"/>` : '';
  const bg = opts.bg ? `<rect width="${F.W}" height="${F.H}" fill="${opts.bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${F.W} ${F.H}" width="${F.W}" height="${F.H}" role="img" aria-label="${opts.title}"><title>${opts.title}</title><defs>${defs}</defs>${bg}<g transform="translate(${r3(F.ox)} ${r3(F.oy)}) scale(${r3(F.s)})"><g transform="translate(${dv[0]})">${drift}${body}</g></g></svg>`;
}

/** Lottie: the logo as one image, shown once per part through an animated mask, so any logo works */
export function toLottie(art: Artwork, P: P, opts: { frame: 'logo' | { W: number; H: number }; bg: string | null; title: string; fps?: number }) {
  const fps = opts.fps || 30;
  const tl = buildTimeline(P, art.rects, art.w, art.h);
  const F = codeFrame(art, P, opts.frame);
  const ts = samples(tl.T, fps);
  const op = ts.length - 1;
  const iw = Math.round(art.w * F.s), ih = Math.round(art.h * F.s);
  // The image, twice the size it shows at, so it's sharp on high-density screens
  const cv = document.createElement('canvas'); cv.width = iw * 2; cv.height = ih * 2;
  cv.getContext('2d')!.drawImage(art.img, 0, 0, cv.width, cv.height);
  const png = cv.toDataURL('image/png');
  const lin = { o: { x: [0], y: [0] }, i: { x: [1], y: [1] } };
  const prop = (vals: (number | number[])[]) => { const same = vals.every((v) => JSON.stringify(v) === JSON.stringify(vals[0])); return same ? { a: 0, k: vals[0] } : { a: 1, k: vals.map((v, i) => ({ t: i, s: Array.isArray(v) ? v : [v], ...(i < vals.length - 1 ? lin : {}) })) }; };
  const shape = (r: number[]) => ({ c: true, v: [[r[0], r[1]], [r[0] + r[2], r[1]], [r[0] + r[2], r[1] + r[3]], [r[0], r[1] + r[3]]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] });
  const layers: object[] = tl.parts.map((part, i) => {
    const fr = ts.map((t) => partAt(P, part, t));
    const cx = (part.r[0] + part.r[2] / 2) * F.s, cy = (part.r[1] + part.r[3] / 2) * F.s;
    const pos = ts.map((t, j) => [r3(F.ox + tl.driftX.at(t) * F.s + fr[j].dx * F.s + cx), r3(F.oy + tl.driftY.at(t) * F.s + fr[j].dy * F.s + cy), 0]);
    const mask = { a: 1, k: fr.map((f, j) => ({ t: j, s: [shape(f.clip.map((n) => r3(n * F.s)))], ...(j < fr.length - 1 ? lin : {}) })) };
    return { ddd: 0, ind: i + 1, ty: 2, nm: `Part ${i + 1}`, refId: 'logo', sr: 1, ao: 0, ip: 0, op, st: 0, bm: 0,
      ks: { o: prop(fr.map((f) => r3(f.opacity * 100))), r: { a: 0, k: 0 }, p: prop(pos), a: { a: 0, k: [r3(cx), r3(cy), 0] }, s: prop(fr.map((f) => [r3(f.scale * 100), r3(f.scale * 100), 100])) },
      hasMask: true, masksProperties: [{ inv: false, mode: 'a', pt: mask, o: { a: 0, k: 100 }, x: { a: 0, k: 0 }, nm: 'Reveal' }] };
  });
  if (opts.bg) layers.push({ ddd: 0, ind: layers.length + 1, ty: 1, nm: 'Background', sr: 1, ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [0, 0, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } }, ao: 0, sw: F.W, sh: F.H, sc: opts.bg.toLowerCase(), ip: 0, op, st: 0, bm: 0 });
  return { v: '5.7.4', fr: fps, ip: 0, op, w: F.W, h: F.H, nm: opts.title, ddd: 0, assets: [{ id: 'logo', w: iw, h: ih, u: '', p: png, e: 1 }], layers, markers: [] };
}
