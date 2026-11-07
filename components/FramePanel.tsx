'use client';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, Ban, CornerDownLeft, Eye, EyeOff, Image as ImageIcon, ImageOff, ImageUp, Minus, Palette, Plus, Scan, Video } from 'lucide-react';
import { fillMedia, type BoxAlign, type FrameLook } from '@/lib/figma/blocks';
import { FillPicker } from '@/components/FillPicker';

// A frame in the design panel, laid out like Figma's: Auto layout (flow, resizing, alignment, gap, padding, clip),
// Appearance (opacity, corner radius), Fill (colour, image or video) and Stroke (colour, opacity, position, weight).

const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
type Size = 'fill' | 'hug' | number | undefined;

function Seg<T extends string>({ value, opts, set, label }: { value: T; opts: [T, string, React.ReactNode][]; set: (v: T) => void; label: string }) {
  return <div className="tx-seg fp-grow" role="radiogroup" aria-label={label}>{opts.map(([v, l, icon]) => <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => set(v)} aria-label={l} data-tip={l}>{icon}</button>)}</div>;
}
function Num({ value, placeholder, set, label, icon, unit, min = 0, max = 2000, step = 1 }: { value?: number; placeholder?: string | number; set: (n: number | undefined) => void; label: string; icon?: React.ReactNode; unit?: string; min?: number; max?: number; step?: number }) {
  return <label className="tx-in tx-unit" data-tip={label}>{icon}<input type="number" min={min} max={max} step={step} value={value ?? ''} placeholder={placeholder === undefined ? '' : String(placeholder)} onChange={(e) => set(e.target.value === '' ? undefined : Math.max(min, Math.min(max, Number(e.target.value))))} aria-label={label} />{unit ? <i>{unit}</i> : null}</label>;
}
/** W or H: a number when fixed, else Fill or Hug, with a menu to switch, as in Figma */
function SizeField({ axis, value, set, fallback }: { axis: 'W' | 'H'; value: Size; set: (v: Size) => void; fallback: 'fill' | 'hug' }) {
  const mode = typeof value === 'number' ? 'fixed' : value || fallback;
  return <div className="fp-size">
    <span className="fp-axis">{axis}</span>
    <input type="number" min={8} max={4000} value={typeof value === 'number' ? value : ''} placeholder="" onChange={(e) => set(e.target.value ? Number(e.target.value) : undefined)} aria-label={`${axis === 'W' ? 'Width' : 'Height'} in pixels`} />
    <select value={mode} onChange={(e) => set(e.target.value === 'fixed' ? (typeof value === 'number' ? value : 240) : e.target.value === fallback ? undefined : (e.target.value as 'fill' | 'hug'))} aria-label={`${axis === 'W' ? 'Width' : 'Height'} sizing`}><option value="fixed">Fixed</option><option value="hug">Hug</option><option value="fill">Fill</option></select>
  </div>;
}
function Hex({ value, set, alpha, setAlpha, label }: { value?: string; set: (hex?: string) => void; alpha?: number; setAlpha: (n?: number) => void; label: string }) {
  const [d, setD] = useState((value || '').replace('#', '').toUpperCase());
  useEffect(() => setD((value || '').replace('#', '').toUpperCase()), [value]);
  return <div className="tx-fill"><span className="tx-sw" style={{ background: value || 'transparent' }} aria-hidden /><input className="tx-hex" value={d} maxLength={6} placeholder="None" onChange={(e) => { const v = e.target.value.replace(/[^0-9a-f]/gi, '').toUpperCase(); setD(v); if (v.length === 6) set('#' + v); }} aria-label={`${label} colour (hex)`} /><label className="tx-alpha"><input type="number" min={0} max={100} value={alpha ?? 100} onChange={(e) => { const n = Math.max(0, Math.min(100, Number(e.target.value) || 0)); setAlpha(n === 100 ? undefined : n); }} aria-label={`${label} opacity`} /><i>%</i></label></div>;
}
function Chips({ palette, value, set }: { palette: { name: string; hex: string }[]; value?: string; set: (hex: string) => void }) {
  return <div className="dp-chips">{palette.map((c) => <button type="button" key={c.hex} className={'dp-chip' + (value?.toUpperCase() === c.hex.toUpperCase() ? ' on' : '')} style={{ background: c.hex }} onClick={() => set(c.hex)} aria-label={`${c.name} ${c.hex}`} title={`${c.name} ${c.hex}`} />)}</div>;
}

export function FramePanel({ look = {}, set, palette, upload, layout, sizing = true, hasContent, pageColours = [], onMake }: {
  look?: FrameLook; set: (l: FrameLook, key?: string) => void; palette: { name: string; hex: string }[]; upload: () => void; pageColours?: string[]; onMake?: () => void;
  /** For a frame that holds content: its alignment and gap (the gap and padding follow the guide's rules unless set) */
  layout?: { align?: BoxAlign; setAlign: (a: BoxAlign | undefined) => void; gap?: number; gapRule: number; setGap: (n?: number) => void; padRule: number; alignGrid: React.ReactNode };
  sizing?: boolean; hasContent?: boolean;
}) {
  const p = (patch: Partial<FrameLook>, key?: string) => set({ ...look, ...patch }, key);
  const [picker, setPicker] = useState<'fill' | 'stroke' | null>(null);
  const kind = look.fill?.type || 'none';
  const media = fillMedia(look);
  return <>
    <section className="dp-sec tx" aria-label="Auto layout">
      <p className="dp-h">{layout ? 'Auto layout' : 'Layout'}</p>
      {layout ? <><div className="tx-lab">Flow</div>
        <div className="fp-row"><Seg value={look.flow || 'col'} set={(v) => p({ flow: v === 'col' ? undefined : v })} label="Flow" opts={[['col', 'Vertical', <ArrowDown key="v" {...I} />], ['row', 'Horizontal', <ArrowRight key="h" {...I} />], ['wrap', 'Wrap', <CornerDownLeft key="w" {...I} />]]} /></div></> : null}
      {sizing ? <><div className="tx-lab">Resizing</div>
        <div className="tx-2"><SizeField axis="W" value={look.sw} fallback="fill" set={(v) => p({ sw: v }, 'sw')} /><SizeField axis="H" value={look.sh} fallback="hug" set={(v) => p({ sh: v }, 'sh')} /></div></> : null}
      {layout ? <div className="fp-ag">
        <div><div className="tx-lab">Alignment</div>{layout.alignGrid}</div>
        <div><div className="tx-lab">Gap</div><Num value={layout.gap} placeholder={layout.gapRule} set={layout.setGap} label="Gap between items" icon={<span className="tx-glyph">)·(</span>} max={400} /></div>
      </div> : null}
      <div className="tx-lab">Padding</div>
      <div className="tx-2">
        <Num value={look.padX ?? look.pad} placeholder={layout?.padRule ?? 0} set={(n) => p({ padX: n, pad: undefined }, 'padX')} label="Padding left and right" icon={<span className="tx-glyph">|◫|</span>} max={400} />
        <Num value={look.padY ?? look.pad} placeholder={layout?.padRule ?? 0} set={(n) => p({ padY: n, pad: undefined }, 'padY')} label="Padding top and bottom" icon={<span className="tx-glyph">⊟</span>} max={400} />
      </div>
      <label className="fp-check"><input type="checkbox" checked={look.clip ?? !hasContent} onChange={(e) => p({ clip: e.target.checked })} />Clip content</label>
    </section>

    <section className="dp-sec tx" aria-label="Appearance">
      <p className="dp-h">Appearance<span className="dp-h-x"><button type="button" className="tx-ic" onClick={() => p({ opacity: look.opacity === 0 ? undefined : 0 })} aria-label={look.opacity === 0 ? 'Show' : 'Hide'} data-tip={look.opacity === 0 ? 'Show' : 'Hide'}>{look.opacity === 0 ? <EyeOff {...I} /> : <Eye {...I} />}</button></span></p>
      <div className="tx-2 tx-lab"><span>Opacity</span><span>Corner radius</span></div>
      <div className="tx-2"><Num value={look.opacity ?? 100} set={(n) => p({ opacity: n === undefined || n >= 100 ? undefined : n }, 'opacity')} label="Opacity" icon={<span className="tx-glyph">▦</span>} unit="%" max={100} step={5} /><Num value={look.radius} placeholder={0} set={(n) => p({ radius: n || undefined }, 'radius')} label="Corner radius" icon={<Scan size={13} strokeWidth={1.75} aria-hidden />} max={400} /></div>
    </section>

    <section className="dp-sec tx" aria-label="Fill">
      <p className="dp-h">Fill<span className="dp-h-x">{kind === 'none' ? <button type="button" className="tx-ic" onClick={() => { p({ fill: { type: 'colour', colour: palette[0]?.hex || '#EEEEEE' } }); setPicker('fill'); }} aria-label="Add a fill" data-tip="Add fill"><Plus {...I} /></button> : <button type="button" className="tx-ic" onClick={() => { p({ fill: undefined, fillAlpha: undefined }); setPicker(null); }} aria-label="Remove the fill" data-tip="Remove fill"><Minus {...I} /></button>}</span></p>
      {look.fill ? <button type="button" className={'fp-swbtn' + (picker === 'fill' ? ' on' : '')} onClick={() => setPicker(picker === 'fill' ? null : 'fill')} aria-expanded={picker === 'fill'}>
        <span className="tx-sw" style={{ background: look.fill.type === 'colour' ? look.fill.colour : look.fill.type === 'gradient' ? `linear-gradient(90deg, ${look.fill.stops.map((x) => `${x.colour} ${x.pos}%`).join(', ')})` : '#ddd' }}>{media ? (media.video ? <Video size={11} strokeWidth={2} aria-hidden /> : <ImageIcon size={11} strokeWidth={2} aria-hidden />) : null}</span>
        <span className="fp-swl">{look.fill.type === 'colour' ? look.fill.colour.replace('#', '').toUpperCase() : look.fill.type === 'gradient' ? 'Linear gradient' : media?.video ? 'Video' : 'Image'}</span>
        <span className="fp-swa">{look.fillAlpha ?? 100}%</span>
      </button> : <p className="fp-none">No fill. Add one with +.</p>}
      {picker === 'fill' ? <FillPicker look={look} set={(patch, key) => p(patch, key)} palette={palette} pageColours={pageColours} upload={upload} onMake={onMake} onClose={() => setPicker(null)} /> : null}
    </section>

    <section className="dp-sec tx" aria-label="Stroke">
      <p className="dp-h">Stroke<span className="dp-h-x">{look.stroke ? <button type="button" className="tx-ic" onClick={() => p({ stroke: undefined, strokeAlpha: undefined })} aria-label="Remove the stroke" data-tip="Remove stroke"><Minus {...I} /></button> : <button type="button" className="tx-ic" onClick={() => p({ stroke: { colour: palette[0]?.hex || '#000000', width: 1 } })} aria-label="Add a stroke" data-tip="Add stroke"><Plus {...I} /></button>}</span></p>
      {look.stroke ? <>
        <button type="button" className={'fp-swbtn' + (picker === 'stroke' ? ' on' : '')} onClick={() => setPicker(picker === 'stroke' ? null : 'stroke')}><span className="tx-sw" style={{ background: look.stroke.colour }} /><span className="fp-swl">{look.stroke.colour.replace('#', '').toUpperCase()}</span><span className="fp-swa">{look.strokeAlpha ?? 100}%</span></button>
        {picker === 'stroke' ? <FillPicker look={look} set={p} palette={palette} pageColours={pageColours} upload={upload} title="Stroke" onClose={() => setPicker(null)} colourOnly={{ hex: look.stroke.colour, alpha: look.strokeAlpha, set: (hex, a) => p({ stroke: { ...look.stroke!, colour: hex }, strokeAlpha: a === undefined || a >= 100 ? undefined : a }, 'sc') }} /> : null}
        <div className="tx-2 tx-lab"><span>Position</span><span>Weight</span></div>
        <div className="tx-2"><select className="tx-in" value={look.strokePos || 'inside'} onChange={(e) => p({ strokePos: e.target.value === 'inside' ? undefined : (e.target.value as 'center' | 'outside') })} aria-label="Stroke position"><option value="inside">Inside</option><option value="center">Center</option><option value="outside">Outside</option></select><Num value={look.stroke.width} set={(n) => p({ stroke: { ...look.stroke!, width: n ?? 1 } }, 'sw')} label="Stroke weight" icon={<span className="tx-glyph">≡</span>} min={0} max={40} /></div>
      </> : null}
    </section>
  </>;
}
