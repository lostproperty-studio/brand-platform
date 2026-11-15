'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff, Plus, RotateCcw, Shuffle, Trash2 } from 'lucide-react';
import { BLENDS, BLEND_LABEL, EFFECTS, PRESETS, defOf, newEffect, presetLayer, shuffle, uid, val, type Effect, type EffectKind, type EffectLayer, type Param, type Preset, type Value } from '@/lib/effects/model';
import { FxRenderer, renderTo } from '@/lib/effects/render';

// Effects in the apps: a canvas that draws a picture through effect layers, the layers panel, the preset library,
// and each effect's settings (laid out like a grading tool: blend, opacity, then the effect's own controls).
// The studio sees every setting and can add any effect; clients add Lost Property's presets and set their strength.

const I = { size: 13, strokeWidth: 1.75, 'aria-hidden': true } as const;

/** A picture drawn through layers. `source` gives the image, video or canvas to draw; `live` redraws every frame
 *  (video, moving grain, frame drop). Fills its parent. */
export function EffectView({ source, layers, time = 0, live = false, className, style, version = 0 }: { source: () => TexImageSource | null; layers: EffectLayer[]; time?: number; live?: boolean; className?: string; style?: React.CSSProperties; version?: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const r = useRef<FxRenderer | null>(null);
  const [err, setErr] = useState('');
  const draw = (t: number) => {
    const c = cv.current, s = source(); if (!c || !s) return;
    try {
      if (!r.current) r.current = new FxRenderer(c);
      const b = c.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1);
      r.current.render(s, b.width * d, b.height * d, layers, t);
    } catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => () => { r.current?.dispose(); r.current = null; }, []);
  useEffect(() => {
    if (!live) { draw(time); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (n: number) => { draw(time + (n - t0) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  });
  useEffect(() => { const c = cv.current?.parentElement; if (!c) return; const ro = new ResizeObserver(() => draw(time)); ro.observe(c); return () => ro.disconnect(); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{err ? <p className="fx-err">{err}</p> : null}<canvas ref={cv} className={className} style={{ display: 'block', width: '100%', height: '100%', ...style }} /></>;
}

/** A small preview of a preset on a picture, drawn with the shared renderer */
function Thumb({ img, layers, w = 160, h = 100 }: { img: HTMLImageElement | null; layers: EffectLayer[]; w?: number; h?: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current; if (!c || !img || !img.naturalWidth) return;
    // The picture cropped to fill the thumbnail, then through the layers
    const tmp = document.createElement('canvas'); tmp.width = w * 2; tmp.height = h * 2; const x = tmp.getContext('2d')!;
    const s = Math.max(tmp.width / img.naturalWidth, tmp.height / img.naturalHeight);
    x.drawImage(img, (tmp.width - img.naturalWidth * s) / 2, (tmp.height - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
    c.width = w * 2; c.height = h * 2;
    try { renderTo(c, tmp, layers, 0.5); } catch { /* no WebGL: the plain picture stays */ }
  }, [img, layers, w, h]);
  return <canvas ref={cv} className="fx-thumb" style={{ aspectRatio: `${w} / ${h}` }} />;
}

/** Lost Property's presets, each shown on the picture being edited. `allowed` limits which ones a client sees. */
export function PresetLibrary({ img, onAdd, allowed }: { img: HTMLImageElement | null; onAdd: (l: EffectLayer) => void; allowed?: string[] }) {
  const list = PRESETS.filter((p) => !allowed || allowed.includes(p.id));
  const layers = useMemo(() => Object.fromEntries(list.map((p) => [p.id, [presetLayer(p)]])), [list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="fx-lib">{list.map((p: Preset) => <button key={p.id} className="fx-lib-i" onClick={() => onAdd(presetLayer(p))} title={p.about}>
    <Thumb img={img} layers={layers[p.id]} /><span className="fx-lib-n">{p.name}</span></button>)}</div>;
}

/** The layers on a picture: switch each on or off, set its strength, reorder, remove. The studio can open a layer to
 *  change each effect, or add effects one by one. */
export function LayersPanel({ layers, set, studio }: { layers: EffectLayer[]; set: (l: EffectLayer[]) => void; studio: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const up = (id: string, x: Partial<EffectLayer>) => set(layers.map((l) => (l.id === id ? { ...l, ...x } : l)));
  const move = (i: number, d: number) => { const n = [...layers]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; set(n); };
  if (!layers.length) return <p className="mute fx-none">No effects yet. Add a preset{studio ? ' or a single effect' : ''}.</p>;
  return <div className="fx-layers">
    {/* Top of the list is the top layer */}
    {[...layers].map((l, i) => ({ l, i })).reverse().map(({ l, i }) => <div key={l.id} className={'fx-layer' + (l.on ? '' : ' off')}>
      <div className="fx-layer-h">
        <button className="fx-ic" onClick={() => up(l.id, { on: !l.on })} aria-label={l.on ? 'Hide' : 'Show'}>{l.on ? <Eye {...I} /> : <EyeOff {...I} />}</button>
        {studio ? <button className="fx-layer-n" onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? <ChevronDown {...I} /> : <ChevronRight {...I} />}{l.name}</button> : <span className="fx-layer-n">{l.name}</span>}
        <button className="fx-ic" onClick={() => move(i, 1)} disabled={i === layers.length - 1} aria-label="Move up"><ChevronUp {...I} /></button>
        <button className="fx-ic" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move down"><ChevronDown {...I} /></button>
        <button className="fx-ic" onClick={() => set(layers.filter((x) => x.id !== l.id))} aria-label="Remove"><Trash2 {...I} /></button>
      </div>
      <label className="fx-amt"><span className="mute">Strength</span><input type="range" min={0} max={100} value={Math.round(l.opacity * 100)} onChange={(e) => up(l.id, { opacity: Number(e.target.value) / 100 })} /><span className="fx-mono">{Math.round(l.opacity * 100)}</span></label>
      {studio && open === l.id ? <div className="fx-stack">
        {l.effects.map((e) => <EffectCard key={e.id} e={e} set={(x) => up(l.id, { effects: l.effects.map((y) => (y.id === e.id ? x : y)) })} remove={() => up(l.id, { effects: l.effects.filter((y) => y.id !== e.id) })} />)}
        {adding ? <div className="fx-add">{EFFECTS.map((d) => <button key={d.kind} className="fx-chip" onClick={() => { up(l.id, { effects: [...l.effects, newEffect(d.kind)], preset: undefined }); setAdding(false); }} title={d.about}>{d.name}</button>)}</div>
          : <button className="btn sm" onClick={() => setAdding(true)}><Plus {...I} />Add an effect to this layer</button>}
      </div> : null}
    </div>)}
  </div>;
}

/** A layer with one effect, for the studio's Add effect */
export const singleLayer = (k: EffectKind): EffectLayer => ({ id: uid(), name: defOf(k).name, on: true, opacity: 1, effects: [newEffect(k)] });
export function AddEffect({ onAdd }: { onAdd: (l: EffectLayer) => void }) {
  return <div className="fx-add">{EFFECTS.map((d) => <button key={d.kind} className="fx-chip" onClick={() => onAdd(singleLayer(d.kind))} title={d.about}>{d.name}</button>)}</div>;
}

// ---------- One effect's settings

export function EffectCard({ e, set, remove }: { e: Effect; set: (e: Effect) => void; remove?: () => void }) {
  const d = defOf(e.kind);
  const [openG, setOpenG] = useState<string | null>(null);
  const p = (key: string, v: Value) => set({ ...e, params: { ...e.params, [key]: v } });
  return <div className={'fx-card' + (e.on ? '' : ' off')}>
    <div className="fx-card-h"><button className="fx-card-t" onClick={() => set({ ...e, on: !e.on })} title={e.on ? 'Switch off' : 'Switch on'}>{d.name}</button>
      <span className="fx-sp" />
      <button className="fx-ic" onClick={() => set(shuffle(e))} aria-label="Shuffle" title="Shuffle"><Shuffle {...I} /></button>
      <button className="fx-ic" onClick={() => set({ ...newEffect(e.kind), id: e.id })} aria-label="Reset" title="Reset"><RotateCcw {...I} /></button>
      {remove ? <button className="fx-ic" onClick={remove} aria-label="Remove" title="Remove"><Trash2 {...I} /></button> : null}
    </div>
    <label className="fx-lbl">Blend</label>
    <select className="fx-sel" value={e.blend} onChange={(x) => set({ ...e, blend: x.target.value as Effect['blend'] })}>{BLENDS.map((b) => <option key={b} value={b}>{BLEND_LABEL[b]}</option>)}</select>
    <Range label="Opacity" v={e.opacity} min={0} max={100} step={1} digits={0} set={(v) => set({ ...e, opacity: v })} />
    <div className="fx-div" />
    {d.params.map((x) => <Control key={x.key} p={x} v={val(e, x.key)} set={(v) => p(x.key, v)} />)}
    {d.groups?.map((g) => <div key={g.title} className="fx-grp"><button className="fx-grp-h" onClick={() => setOpenG(openG === g.title ? null : g.title)}>{g.title}{openG === g.title ? <ChevronDown {...I} /> : <ChevronRight {...I} />}</button>
      {openG === g.title ? <div className="fx-grp-b">{g.params.map((x) => <Control key={x.key} p={x} v={val(e, x.key)} set={(v) => p(x.key, v)} />)}</div> : null}</div>)}
  </div>;
}

function Range({ label, v, min, max, step, digits = 2, set, text }: { label: string; v: number; min: number; max: number; step: number; digits?: number; set: (v: number) => void; text?: string }) {
  return <label className="fx-row"><span className="fx-row-h"><span>{label}</span><span className="fx-mono">{text ?? Number(v).toFixed(digits)}</span></span>
    <input className="fx-range" type="range" min={min} max={max} step={step} value={v} onChange={(x) => set(Number(x.target.value))} style={{ '--p': `${((v - min) / (max - min)) * 100}%` } as React.CSSProperties} /></label>;
}

function Control({ p, v, set }: { p: Param; v: Value; set: (v: Value) => void }) {
  if (p.kind === 'range') return <Range label={p.label} v={Number(v)} min={p.min} max={p.max} step={p.step} digits={p.digits} set={set} />;
  if (p.kind === 'steps') return <Range label={p.label} v={Number(v)} min={0} max={p.options.length - 1} step={1} text={p.options[Number(v)] || ''} set={set} />;
  if (p.kind === 'toggle') return <div className="fx-row fx-inline"><span>{p.label}</span><button className={'fx-tog' + (v ? ' on' : '')} onClick={() => set(!v)} aria-pressed={!!v}><i />{v ? 'On' : 'Off'}</button></div>;
  if (p.kind === 'colour') return <label className="fx-row fx-inline"><span>{p.label}</span><input className="fx-col" type="color" value={String(v)} onChange={(x) => set(x.target.value)} /></label>;
  if (p.kind === 'xy') return <XY label={p.label} v={v as [number, number]} set={set} />;
  return <Wheel label={p.label} v={v as [number, number]} set={set} />;
}

/** Drags a point; reports where, from the box's edges (0 to 1) */
function useDrag(onPos: (x: number, y: number) => void) {
  return (e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget; const go = (ev: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(); onPos(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))); };
    go(e); const mv = (ev: PointerEvent) => go(ev); const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };
}
function XY({ label, v, set }: { label: string; v: [number, number]; set: (v: Value) => void }) {
  const down = useDrag((x, y) => set([+(x * 2 - 1).toFixed(2), +(1 - y * 2).toFixed(2)]));
  return <div className="fx-row"><span className="fx-row-h"><span className="fx-trunc">{label}</span><span className="fx-mono">{v[0].toFixed(2)}&nbsp;&nbsp;{v[1].toFixed(2)}</span></span>
    <div className="fx-xy" onPointerDown={down} onDoubleClick={() => set([0, 0])}><i style={{ left: `${(v[0] + 1) * 50}%`, top: `${(1 - v[1]) * 50}%` }} /></div></div>;
}
/** A colour wheel: hue around, amount out from the middle */
function Wheel({ label, v, set }: { label: string; v: [number, number]; set: (v: Value) => void }) {
  const down = useDrag((x, y) => { const dx = x * 2 - 1, dy = y * 2 - 1; const a = Math.min(1, Math.hypot(dx, dy)); const h = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360; set([Math.round(h), +(a < 0.06 ? 0 : a).toFixed(2)]); });
  const h = (v[0] * Math.PI) / 180, a = v[1];
  return <div className="fx-row"><span className="fx-row-h"><span>{label}</span><span className="fx-mono">{a.toFixed(2)}&nbsp;&nbsp;{Math.round(v[0])}</span></span>
    <div className="fx-wheel" onPointerDown={down} onDoubleClick={() => set([0, 0])}><i style={{ left: `${50 + Math.sin(h) * a * 50}%`, top: `${50 - Math.cos(h) * a * 50}%` }} /></div></div>;
}
