'use client';
import { useEffect, useRef, useState } from 'react';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, Eye, FoldVertical, List, ListOrdered, Minus, RotateCcw, SlidersHorizontal, Strikethrough, Underline, X, LayoutGrid
} from 'lucide-react';
import type { TextCase, TextStyle } from '@/lib/figma/blocks';
import { TYPE_IDS, type GuideSystem, type TypeId } from '@/lib/guideSystem';
import type { ToolbarFont } from '@/components/GuideDock';
import { ScaleSelect, typeLabel } from '@/components/GuideStyles';

// Text in the design panel, laid out like Figma's: Typography (style, typeface, weight, size, line height, letter
// spacing, alignment), Fill and Appearance, with the finer settings (decoration, case, lists, paragraph spacing,
// truncation, wrapping) one click away. Each text starts from one of the guide's styles; changing a value here
// overrides it for this text only, and Reset puts it back on the style.

const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
const WEIGHT_NAME: Record<number, string> = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };
const SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96, 112, 128];
const OVERRIDES: (keyof TextStyle)[] = ['font', 'weight', 'size', 'leading', 'tracking', 'case'];

function Ic<T extends string>({ value, opts, set, label }: { value?: T; opts: [T | undefined, string, React.ReactNode][]; set: (v: T | undefined) => void; label: string }) {
  return <div className="tx-seg" role="radiogroup" aria-label={label}>{opts.map(([v, l, icon]) => <button key={l} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => set(v)} aria-label={l} data-tip={l}>{icon}</button>)}</div>;
}

export function TypePanel({ style, setStyle, sys, auto, fonts, onAddFont, palette, openStyles, valign }: {
  style: TextStyle; setStyle: (p: Partial<TextStyle>, key?: string) => void; sys: GuideSystem; auto: TypeId; fonts: ToolbarFont[];
  onAddFont?: (then: (role: string) => void) => void; palette: { name: string; hex: string }[]; openStyles: (focus?: TypeId) => void;
  /** Inside a frame: the frame's vertical alignment, shown with the text's */ valign?: { value?: 'start' | 'center' | 'end' | 'between'; set: (v: 'start' | 'center' | 'end') => void };
}) {
  const [more, setMore] = useState(false);
  const [pick, setPick] = useState(false);
  const pickRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!pick) return; const off = (e: MouseEvent) => { if (!pickRef.current?.contains(e.target as Node)) setPick(false); }; document.addEventListener('mousedown', off); return () => document.removeEventListener('mousedown', off); }, [pick]);
  const id = style.ts || auto, base = sys.type[id];
  const eff = { font: style.font || base.font, weight: style.weight || base.weight, size: style.size || base.size, leading: style.leading ?? base.leading, tracking: style.tracking ?? base.tracking, case: style.case ?? base.case };
  const overridden = OVERRIDES.some((k) => style[k] !== undefined);
  const font = fonts.find((f) => f.role === eff.font);
  const weights = font?.weights.length ? font.weights : [300, 400, 500, 600, 700];
  const hex = (style.color || '').replace('#', '').toUpperCase();
  const [hexDraft, setHexDraft] = useState(hex);
  useEffect(() => setHexDraft(hex), [hex]);

  return <>
    <section className="dp-sec tx" aria-label="Typography">
      <p className="dp-h">Typography<span className="dp-h-x" ref={pickRef} style={{ position: 'relative' }}>
        <button type="button" className="tx-ic" onClick={() => setPick(!pick)} aria-label="Text styles" data-tip="Text styles" aria-expanded={pick}><LayoutGrid {...I} /></button>
        {pick ? <div className="tx-pick" role="listbox" aria-label="Text styles">
          {TYPE_IDS.map((t) => { const x = sys.type[t]; return <button key={t} type="button" role="option" aria-selected={id === t} className={'tp-opt' + (id === t ? ' on' : '')} onClick={() => { setStyle({ ts: t === auto ? undefined : t }); setPick(false); }}><span className="tp-id">{typeLabel(t)}</span><span className="tp-prev" style={{ fontFamily: `var(--font-${x.font}, inherit)`, fontWeight: x.weight, fontSize: Math.min(20, x.size) }}>{x.name}</span><span className="tp-meta">{x.size}{t === auto ? ' · default' : ''}</span></button>; })}
          <button type="button" className="tp-edit" onClick={() => { setPick(false); openStyles(id); }}>Edit text styles…</button>
        </div> : null}
      </span></p>
      <div className="tx-style">
        <button type="button" className="tx-chip" onClick={() => setPick(true)} data-tip="Change the text style"><span className="tp-id">{typeLabel(id)}</span>{base.name}{overridden ? <i>· edited</i> : null}</button>
        {overridden ? <button type="button" className="tx-ic" onClick={() => setStyle(Object.fromEntries(OVERRIDES.map((k) => [k, undefined])) as Partial<TextStyle>)} aria-label="Reset to the style" data-tip="Reset to the style"><RotateCcw {...I} /></button> : null}
      </div>
      <select className="tx-in" value={eff.font} onChange={(e) => { if (e.target.value === '__add') { onAddFont?.((role) => setStyle({ font: role })); return; } setStyle({ font: e.target.value === base.font ? undefined : e.target.value }); }} aria-label="Typeface">
        {fonts.map((f) => <option key={f.role} value={f.role}>{f.name || f.label}</option>)}
        {!fonts.some((f) => f.role === eff.font) ? <option value={eff.font}>{eff.font}</option> : null}
        {onAddFont ? <option value="__add">Upload a typeface…</option> : null}
      </select>
      <div className="tx-2">
        <select className="tx-in" value={eff.weight} onChange={(e) => { const w = Number(e.target.value); setStyle({ weight: w === base.weight ? undefined : w }); }} aria-label="Weight">{(weights.includes(eff.weight) ? weights : [...weights, eff.weight].sort((a, b) => a - b)).map((w) => <option key={w} value={w}>{WEIGHT_NAME[w] || w}</option>)}</select>
        <div className="tx-size"><input className="tx-in" type="number" min={8} max={240} value={eff.size} onChange={(e) => { const n = Number(e.target.value); if (n) setStyle({ size: n === base.size ? undefined : Math.max(8, Math.min(240, n)) }, 'size'); }} aria-label="Size" />
          <select className="tx-in" value="" onChange={(e) => e.target.value && setStyle({ size: Number(e.target.value) === base.size ? undefined : Number(e.target.value) })} aria-label="Pick a size"><option value="" disabled />{SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
      </div>
      <div className="tx-2 tx-lab"><span>Line height</span><span>Letter spacing</span></div>
      <div className="tx-2">
        <label className="tx-in tx-unit" data-tip="Line height"><FoldVertical {...I} /><input type="number" step={5} min={70} max={250} value={Math.round(eff.leading * 100)} onChange={(e) => { const n = Number(e.target.value) / 100; if (n) setStyle({ leading: n === base.leading ? undefined : n }, 'leading'); }} aria-label="Line height in percent" /><i>%</i></label>
        <label className="tx-in tx-unit" data-tip="Letter spacing"><span className="tx-glyph" aria-hidden>|A|</span><input type="number" step={0.5} value={Math.round(eff.tracking * 1000) / 10} onChange={(e) => { const n = (Number(e.target.value) || 0) / 100; setStyle({ tracking: n === base.tracking ? undefined : n }, 'tracking'); }} aria-label="Letter spacing in percent" /><i>%</i></label>
      </div>
      <div className="tx-lab">Alignment</div>
      <div className="tx-align">
        <Ic value={style.align || 'left'} set={(v) => setStyle({ align: v === 'left' ? undefined : v })} label="Horizontal alignment" opts={[['left', 'Left', <AlignLeft key="l" {...I} />], ['center', 'Centre', <AlignCenter key="c" {...I} />], ['right', 'Right', <AlignRight key="r" {...I} />]]} />
        {valign ? <Ic value={valign.value === 'between' ? undefined : valign.value || 'start'} set={(v) => v && valign.set(v)} label="Vertical alignment in the frame" opts={[['start', 'Top', <ArrowUpToLine key="t" {...I} />], ['center', 'Middle', <FoldVertical key="m" {...I} />], ['end', 'Bottom', <ArrowDownToLine key="b" {...I} />]]} /> : <span />}
        <button type="button" className={'tx-ic' + (more ? ' on' : '')} onClick={() => setMore(!more)} aria-label="More type settings" data-tip="More type settings" aria-expanded={more}><SlidersHorizontal {...I} /></button>
      </div>
      {more ? <div className="tx-more" role="group" aria-label="More type settings">
        <div className="tx-more-top"><strong>Type settings</strong><button type="button" className="tx-ic" onClick={() => setMore(false)} aria-label="Close"><X {...I} /></button></div>
        <div className="tx-prev" style={{ fontFamily: `var(--font-${eff.font}, inherit)`, fontWeight: eff.weight, letterSpacing: `${eff.tracking}em`, textAlign: style.align || 'left', textDecoration: style.decoration === 'strike' ? 'line-through' : style.decoration ? 'underline' : undefined, textTransform: eff.case === 'upper' ? 'uppercase' : eff.case === 'lower' ? 'lowercase' : eff.case === 'title' ? 'capitalize' : undefined, fontVariantCaps: eff.case === 'smallcaps' ? 'all-small-caps' : undefined }}>Preview</div>
        <div className="tx-row"><span>Alignment</span><Ic value={style.align || 'left'} set={(v) => setStyle({ align: v === 'left' ? undefined : v })} label="Alignment" opts={[['left', 'Left', <AlignLeft key="l" {...I} />], ['center', 'Centre', <AlignCenter key="c" {...I} />], ['right', 'Right', <AlignRight key="r" {...I} />], ['justify', 'Justified', <AlignJustify key="j" {...I} />]]} /></div>
        <div className="tx-row"><span>Decoration</span><Ic value={style.decoration} set={(v) => setStyle({ decoration: v })} label="Decoration" opts={[[undefined, 'None', <Minus key="n" {...I} />], ['underline', 'Underline', <Underline key="u" {...I} />], ['strike', 'Strikethrough', <Strikethrough key="s" {...I} />]]} /></div>
        <div className="tx-row"><span>Case</span><Ic<TextCase> value={style.case ?? base.case} set={(v) => setStyle({ case: v === base.case ? undefined : v })} label="Case" opts={[[undefined, 'As typed', <Minus key="n" {...I} />], ['upper', 'Uppercase', <b key="u">AG</b>], ['lower', 'Lowercase', <b key="l">ag</b>], ['title', 'Title case', <b key="t">Ag</b>], ['smallcaps', 'Small caps', <b key="s" style={{ fontVariantCaps: 'all-small-caps' }}>Ag</b>]]} /></div>
        <span className="tx-sep" />
        <div className="tx-row"><span>List style</span><Ic value={style.list} set={(v) => setStyle({ list: v })} label="List style" opts={[[undefined, 'None', <Minus key="n" {...I} />], ['bullet', 'Bullets', <List key="b" {...I} />], ['number', 'Numbers', <ListOrdered key="o" {...I} />]]} /></div>
        <div className="tx-row"><span>Paragraph spacing</span><div className="tx-narrow2"><ScaleSelect value={style.paraGap} auto={10} set={(n) => setStyle({ paraGap: n }, 'para')} label="Paragraph spacing" /></div></div>
        <div className="tx-row"><span>Truncate text</span><Ic value={style.truncate ? 'on' : undefined} set={(v) => setStyle({ truncate: v === 'on' || undefined })} label="Truncate text" opts={[[undefined, 'Off', <Minus key="n" {...I} />], ['on', 'Truncate with …', <b key="t">A…</b>]]} /></div>
        <div className="tx-row"><span>Wrap style</span><select className="tx-in tx-narrow" value={style.wrap || ''} onChange={(e) => setStyle({ wrap: (e.target.value || undefined) as TextStyle['wrap'] })} aria-label="Wrap style"><option value="">Auto</option><option value="balance">Balance</option><option value="pretty">Pretty</option></select></div>
      </div> : null}
    </section>

    <section className="dp-sec tx" aria-label="Fill">
      <p className="dp-h">Fill</p>
      <div className="tx-fill">
        <span className="tx-sw" style={{ background: style.color || 'currentColor' }} aria-hidden />
        <input className="tx-hex" value={style.color ? hexDraft : ''} placeholder="Auto" maxLength={6} onChange={(e) => { const v = e.target.value.replace(/[^0-9a-f]/gi, '').toUpperCase(); setHexDraft(v); if (v.length === 6) setStyle({ color: '#' + v }, 'color'); if (!v) setStyle({ color: undefined, alpha: undefined }); }} aria-label="Colour (hex)" />
        <label className="tx-alpha"><input type="number" min={0} max={100} value={style.alpha ?? 100} onChange={(e) => { const n = Math.max(0, Math.min(100, Number(e.target.value) || 0)); setStyle({ alpha: n === 100 ? undefined : n }, 'alpha'); }} aria-label="Fill opacity" disabled={!style.color} /><i>%</i></label>
      </div>
      <div className="dp-chips">{palette.map((c) => <button type="button" key={c.hex} className={'dp-chip' + (style.color?.toUpperCase() === c.hex.toUpperCase() ? ' on' : '')} style={{ background: c.hex }} onClick={() => setStyle({ color: c.hex })} aria-label={`${c.name} ${c.hex}`} title={`${c.name} ${c.hex}`} />)}<button type="button" className="dp-link" onClick={() => setStyle({ color: undefined, alpha: undefined })}>Auto</button></div>
    </section>

    <section className="dp-sec tx" aria-label="Appearance">
      <p className="dp-h">Appearance<span className="dp-h-x"><button type="button" className={'tx-ic' + (style.opacity === 0 ? ' on' : '')} onClick={() => setStyle({ opacity: style.opacity === 0 ? undefined : 0 })} aria-label={style.opacity === 0 ? 'Show' : 'Hide'} data-tip={style.opacity === 0 ? 'Show' : 'Hide'}><Eye {...I} /></button></span></p>
      <div className="tx-2 tx-lab"><span>Opacity</span><span /></div>
      <div className="tx-2"><label className="tx-in tx-unit"><span className="tx-glyph" aria-hidden>▦</span><input type="number" min={0} max={100} step={5} value={style.opacity ?? 100} onChange={(e) => { const n = Math.max(0, Math.min(100, Number(e.target.value) || 0)); setStyle({ opacity: n === 100 ? undefined : n }, 'opacity'); }} aria-label="Opacity in percent" /><i>%</i></label><span /></div>
    </section>
  </>;
}
