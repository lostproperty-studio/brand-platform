'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Blend, Image as ImageIcon, Pipette, Play, Plus, Sparkles, Square, Trash2, Upload, X } from 'lucide-react';
import type { FrameLook } from '@/lib/figma/blocks';

// The fill picker, like Figma's: Custom (solid, gradient, image or video) and Libraries (the brand's colours).
// Solid has a colour field with hue and opacity, hex and HSB, an eyedropper and the colours already on the page.
// Image and video have a mode and upload (or make, when an image tool is connected), and images can be adjusted.

const I = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;
type Kind = 'colour' | 'gradient' | 'image' | 'video';
type Fill = FrameLook['fill'];
type Adjust = NonNullable<FrameLook['adjust']>;

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
export function hexToHsv(hex: string): [number, number, number] {
  const n = parseInt((/^#?[0-9a-f]{6}$/i.test(hex) ? hex.replace('#', '') : '000000'), 16); const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const h = d === 0 ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(((h * 60) + 360) % 360), mx === 0 ? 0 : d / mx, mx];
}
export function hsvToHex(h: number, s: number, v: number) {
  const f = (k: number) => { const kk = (k + h / 60) % 6; return v - v * s * Math.max(0, Math.min(kk, 4 - kk, 1)); };
  return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Drag inside an element, reporting x and y from 0 to 1 */
function useDrag(onMove: (x: number, y: number) => void) {
  return (e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget; const at = (ev: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(); onMove(clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height)); };
    at(e); e.preventDefault();
    const mv = (ev: PointerEvent) => at(ev); const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
}

/** A colour: the field, hue and opacity sliders, eyedropper, hex or HSB, and swatches */
export function ColourField({ hex, alpha = 100, set, swatches }: { hex: string; alpha?: number; set: (hex: string, alpha?: number) => void; swatches: { label: string; colours: { name: string; hex: string }[] }[] }) {
  const [hsv, setHsv] = useState(() => hexToHsv(hex));
  const [mode, setMode] = useState<'hex' | 'hsb'>('hex');
  const [draft, setDraft] = useState(hex.replace('#', ''));
  useEffect(() => { if (hsvToHex(...hsv) !== hex.toUpperCase()) setHsv(hexToHsv(hex)); setDraft(hex.replace('#', '').toUpperCase()); }, [hex]); // eslint-disable-line react-hooks/exhaustive-deps
  const put = (h: number, s: number, v: number) => { setHsv([h, s, v]); set(hsvToHex(h, s, v), alpha); };
  const field = useDrag((x, y) => put(hsv[0], x, 1 - y));
  const hue = useDrag((x) => put(Math.round(x * 359), hsv[1], hsv[2]));
  const alp = useDrag((x) => set(hsvToHex(...hsv), Math.round(x * 100)));
  const pure = hsvToHex(hsv[0], 1, 1);
  const eye = typeof window !== 'undefined' && 'EyeDropper' in window;
  return <div className="fk-col">
    <div className="fk-field" style={{ background: pure }} onPointerDown={field}><span className="fk-knob" style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%`, background: hex }} /></div>
    <div className="fk-sliders">
      {eye ? <button type="button" className="fk-ic" onClick={async () => { try { const r = await new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper().open(); set(r.sRGBHex.toUpperCase(), alpha); } catch { /* cancelled */ } }} aria-label="Pick a colour from the screen" data-tip="Eyedropper"><Pipette {...I} /></button> : <span />}
      <div className="fk-bars">
        <div className="fk-hue" onPointerDown={hue}><span className="fk-thumb" style={{ left: `${(hsv[0] / 359) * 100}%`, background: pure }} /></div>
        <div className="fk-alpha" onPointerDown={alp}><i style={{ background: `linear-gradient(90deg, transparent, ${hex})` }} /><span className="fk-thumb" style={{ left: `${alpha}%`, background: hex }} /></div>
      </div>
    </div>
    <div className="fk-vals">
      <select value={mode} onChange={(e) => setMode(e.target.value as 'hex' | 'hsb')} aria-label="Colour format"><option value="hex">Hex</option><option value="hsb">HSB</option></select>
      {mode === 'hex' ? <input className="fk-hex" value={draft} maxLength={6} onChange={(e) => { const v = e.target.value.replace(/[^0-9a-f]/gi, '').toUpperCase(); setDraft(v); if (v.length === 6) set('#' + v, alpha); }} aria-label="Hex" />
        : <>{[[hsv[0], 359, 'H'], [Math.round(hsv[1] * 100), 100, 'S'], [Math.round(hsv[2] * 100), 100, 'B']].map(([v, max, l], k) => <input key={l as string} type="number" min={0} max={max as number} value={v as number} aria-label={l as string} onChange={(e) => { const n = clamp(Number(e.target.value) || 0, 0, max as number); const nx: [number, number, number] = [...hsv] as [number, number, number]; nx[k] = k === 0 ? n : n / 100; put(...nx); }} />)}</>}
      <label className="fk-pc"><input type="number" min={0} max={100} value={alpha} onChange={(e) => set(hex, clamp(Number(e.target.value) || 0, 0, 100))} aria-label="Opacity" /><i>%</i></label>
    </div>
    {swatches.filter((g) => g.colours.length).map((g) => <div key={g.label} className="fk-sw"><p>{g.label}</p><div>{g.colours.map((c) => <button key={g.label + c.hex} type="button" style={{ background: c.hex }} className={c.hex.toUpperCase() === hex.toUpperCase() ? 'on' : ''} onClick={() => set(c.hex.toUpperCase(), alpha)} aria-label={`${c.name} ${c.hex}`} title={`${c.name} ${c.hex}`} />)}</div></div>)}
  </div>;
}

const ADJ: [keyof Adjust, string][] = [['exposure', 'Exposure'], ['contrast', 'Contrast'], ['saturation', 'Saturation'], ['temperature', 'Temperature'], ['tint', 'Tint'], ['highlights', 'Highlights'], ['shadows', 'Shadows']];

export function FillPicker({ look, set, palette, pageColours, upload, onMake, kinds = ['colour', 'gradient', 'image', 'video'], title = 'Fill', onClose, colourOnly }: {
  look: FrameLook; set: (patch: Partial<FrameLook>, key?: string) => void; palette: { name: string; hex: string }[]; pageColours: string[];
  upload: (kind: 'image' | 'video') => void; onMake?: () => void; kinds?: Kind[]; title?: string; onClose: () => void;
  /** For a stroke: just a colour, read and set here */ colourOnly?: { hex: string; alpha?: number; set: (hex: string, alpha?: number) => void };
}) {
  const fill = look.fill as Fill;
  const [tab, setTab] = useState<'custom' | 'libraries'>('custom');
  const [kind, setKind] = useState<Kind>(colourOnly ? 'colour' : (fill?.type as Kind) || 'colour');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; const off = (e: MouseEvent) => { const t = e.target as HTMLElement; if (ref.current && !ref.current.contains(t) && !t.closest('.fp-swbtn, .fk-keep')) onClose(); }; window.addEventListener('keydown', k); document.addEventListener('mousedown', off); return () => { window.removeEventListener('keydown', k); document.removeEventListener('mousedown', off); }; }, [onClose]);
  const swatches = [{ label: 'Brand colours', colours: palette }, { label: 'On this page', colours: pageColours.filter((h) => !palette.some((p) => p.hex.toUpperCase() === h.toUpperCase())).slice(0, 12).map((h) => ({ name: h, hex: h })) }];
  const colourHex = colourOnly ? colourOnly.hex : fill?.type === 'colour' ? fill.colour : palette[0]?.hex || '#EEEEEE';
  const setColour = (hex: string, a?: number) => colourOnly ? colourOnly.set(hex, a) : set({ fill: { type: 'colour', colour: hex }, fillAlpha: a === undefined || a >= 100 ? undefined : a }, 'fill');
  const grad = fill?.type === 'gradient' ? fill : { type: 'gradient' as const, angle: 180, stops: [{ colour: palette[0]?.hex || '#000000', pos: 0 }, { colour: palette[1]?.hex || '#FFFFFF', pos: 100 }] };
  const [stop, setStop] = useState(0);
  const media = fill?.type === 'image' || fill?.type === 'video' ? fill.media : undefined;
  const pick = (k: Kind) => { setKind(k); if (k === 'colour' && fill?.type !== 'colour') setColour(colourHex); if (k === 'gradient' && fill?.type !== 'gradient') set({ fill: grad }); };

  // Above everything, beside the design panel
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="fk" ref={ref} role="dialog" aria-label={title} onMouseDown={(e) => { if (!(e.target as HTMLElement).closest('input, select')) e.preventDefault(); }}>
    <div className="fk-top">
      <div className="fk-tabs" role="tablist"><button role="tab" aria-selected={tab === 'custom'} className={tab === 'custom' ? 'on' : ''} onClick={() => setTab('custom')}>Custom</button><button role="tab" aria-selected={tab === 'libraries'} className={tab === 'libraries' ? 'on' : ''} onClick={() => setTab('libraries')}>Libraries</button></div>
      <button type="button" className="fk-ic" onClick={onClose} aria-label="Close"><X {...I} /></button>
    </div>
    {tab === 'libraries' ? <div className="fk-lib">
      <p className="fk-h">Brand colours</p>
      {palette.map((c) => <button key={c.hex} type="button" className="fk-libc" onClick={() => setColour(c.hex.toUpperCase())}><i style={{ background: c.hex }} /><span>{c.name}</span><em>{c.hex.toUpperCase()}</em></button>)}
      {!palette.length ? <p className="fk-note">Add colours in the brand’s colour chapter to see them here.</p> : null}
    </div> : <>
      {!colourOnly ? <div className="fk-kinds" role="radiogroup" aria-label="Fill type">
        {kinds.map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => pick(k)} aria-label={k === 'colour' ? 'Solid' : k[0].toUpperCase() + k.slice(1)} data-tip={k === 'colour' ? 'Solid' : k[0].toUpperCase() + k.slice(1)}>{k === 'colour' ? <Square {...I} /> : k === 'gradient' ? <Blend {...I} /> : k === 'image' ? <ImageIcon {...I} /> : <Play {...I} />}</button>)}
      </div> : null}
      {kind === 'colour' ? <ColourField hex={colourHex} alpha={colourOnly ? colourOnly.alpha : look.fillAlpha} set={setColour} swatches={swatches} /> : null}
      {kind === 'gradient' ? <div className="fk-grad">
        <div className="fk-gbar" style={{ background: `linear-gradient(90deg, ${grad.stops.map((x) => `${x.colour} ${x.pos}%`).join(', ')})` }}>{grad.stops.map((x, k) => <button key={k} type="button" className={'fk-stop' + (k === stop ? ' on' : '')} style={{ left: `${x.pos}%`, background: x.colour }} onClick={() => setStop(k)} aria-label={`Stop ${k + 1}`} />)}</div>
        <div className="fk-grow"><label>Angle<input type="number" value={grad.angle} onChange={(e) => set({ fill: { ...grad, angle: Number(e.target.value) || 0 } }, 'ga')} />°</label><label>Position<input type="number" min={0} max={100} value={grad.stops[stop]?.pos ?? 0} onChange={(e) => set({ fill: { ...grad, stops: grad.stops.map((x, k) => (k === stop ? { ...x, pos: clamp(Number(e.target.value) || 0, 0, 100) } : x)) } }, 'gp')} />%</label>
          <button type="button" className="fk-ic" onClick={() => { const stops = [...grad.stops, { colour: grad.stops[grad.stops.length - 1].colour, pos: 50 }].sort((a, b) => a.pos - b.pos); set({ fill: { ...grad, stops } }); }} aria-label="Add a stop" data-tip="Add stop"><Plus {...I} /></button>
          {grad.stops.length > 2 ? <button type="button" className="fk-ic" onClick={() => { set({ fill: { ...grad, stops: grad.stops.filter((_, k) => k !== stop) } }); setStop(0); }} aria-label="Remove this stop" data-tip="Remove stop"><Trash2 {...I} /></button> : null}</div>
        <ColourField hex={grad.stops[stop]?.colour || '#000000'} set={(hex) => set({ fill: { ...grad, stops: grad.stops.map((x, k) => (k === stop ? { ...x, colour: hex } : x)) } }, 'gc')} swatches={swatches} />
      </div> : null}
      {kind === 'image' || kind === 'video' ? <div className="fk-media">
        <select className="fk-mode" value={look.fit || 'fill'} onChange={(e) => set({ fit: e.target.value === 'fill' ? undefined : (e.target.value as 'fit' | 'crop') })} aria-label="Mode"><option value="fill">Fill</option><option value="fit">Fit</option><option value="crop">Crop</option></select>
        <div className="fk-drop">
          {media && (fill?.type === kind) ? <p className="fk-cur">{kind === 'video' ? 'Video' : 'Image'} in place</p> : null}
          <button type="button" className="fk-up" onClick={() => upload(kind)}><Upload {...I} />{media && fill?.type === kind ? 'Replace from computer' : 'Upload from computer'}</button>
          {kind === 'image' ? <button type="button" className="fk-make" onClick={onMake} disabled={!onMake} data-tip={onMake ? undefined : 'Connect an image generator in Settings'}><Sparkles {...I} />Make an image</button> : null}
        </div>
        {look.fit === 'crop' && media ? <div className="fk-adj"><label>Zoom<input type="range" min={1} max={3} step={0.05} value={look.zoom || 1} onChange={(e) => set({ zoom: Number(e.target.value) }, 'zoom')} /></label><label>Across<input type="range" min={0} max={100} value={look.x ?? 50} onChange={(e) => set({ x: Number(e.target.value) }, 'x')} /></label><label>Down<input type="range" min={0} max={100} value={look.y ?? 50} onChange={(e) => set({ y: Number(e.target.value) }, 'y')} /></label></div> : null}
        {kind === 'image' ? <div className="fk-adj">{ADJ.map(([k, l]) => <label key={k}>{l}<input type="range" min={-100} max={100} value={look.adjust?.[k] ?? 0} onChange={(e) => set({ adjust: { ...(look.adjust || {}), [k]: Number(e.target.value) || undefined } }, 'adj-' + k)} onDoubleClick={() => set({ adjust: { ...(look.adjust || {}), [k]: undefined } })} /></label>)}</div> : null}
      </div> : null}
    </>}
  </div>, document.body);
}
