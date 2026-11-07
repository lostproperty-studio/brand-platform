'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, Minus, Plus, RotateCcw, Upload, X } from 'lucide-react';
import type { TextCase } from '@/lib/figma/blocks';
import { SPACE_RULES, SPACE_STEPS, TYPE_IDS, TYPE_USE, spaceName, type GuideSystem, type SpaceRule, type TypeDef, type TypeId } from '@/lib/guideSystem';
import type { ToolbarFont } from '@/components/GuideDock';

// The Styles window: the guide's text styles, spacing and colours in one place, like a slide app's local styles.
// Change a style here and every text using it, in every chapter, changes with it.

const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
const WEIGHT_NAME: Record<number, string> = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };
const CASES: [TextCase | '', string][] = [['', 'As written'], ['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['sentence', 'Sentence case'], ['title', 'Title Case']];
const SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96, 112, 128];
export const typeLabel = (id: TypeId) => (id === 'body' ? 'Body' : id === 'caption' ? 'Caption' : id.toUpperCase());
const fontName = (fonts: ToolbarFont[], role: string) => { const f = fonts.find((x) => x.role === role); return f?.name || f?.label || role; };
const css = (d: TypeDef) => ({ fontFamily: `var(--font-${d.font}, inherit)`, fontWeight: d.weight, letterSpacing: `${d.tracking}em`, lineHeight: 1.1, textTransform: (d.case === 'upper' ? 'uppercase' : d.case === 'lower' ? 'lowercase' : d.case === 'title' ? 'capitalize' : 'none') as React.CSSProperties['textTransform'] });

/** A step on the spacing scale, as a compact select: "M · 20" */
export function SpaceSelect({ value, set, label }: { value: number; set: (px: number) => void; label: string }) {
  const i = Math.max(0, SPACE_STEPS.findIndex((s) => s.px === value));
  return <div className="sp-sel" role="group" aria-label={label}>
    <button type="button" onClick={() => set(SPACE_STEPS[Math.max(0, i - 1)].px)} disabled={i === 0} aria-label={`Less ${label.toLowerCase()}`}><Minus size={12} strokeWidth={2} aria-hidden /></button>
    <select value={value} onChange={(e) => set(Number(e.target.value))} aria-label={label}>{(SPACE_STEPS.some((s) => s.px === value) ? SPACE_STEPS : [...SPACE_STEPS, { px: value, name: 'Custom' }]).map((s) => <option key={s.px} value={s.px}>{s.px}px</option>)}</select>
    <button type="button" onClick={() => set(SPACE_STEPS[Math.min(SPACE_STEPS.length - 1, i + 1)].px)} disabled={i === SPACE_STEPS.length - 1} aria-label={`More ${label.toLowerCase()}`}><Plus size={12} strokeWidth={2} aria-hidden /></button>
  </div>;
}

/** A space that follows a guide-wide rule, or is set for just this one place */
export function SpaceCtl({ sys, rule, own, setRule, setOwn, label }: { sys: GuideSystem; rule: SpaceRule; own?: number; setRule: (px: number) => void; setOwn: (px: number | undefined) => void; label: string }) {
  const ruleInfo = SPACE_RULES.find((r) => r.id === rule)!;
  const v = own ?? sys.space[rule];
  return <div className="sp-ctl">
    <SpaceSelect value={v} set={(px) => (own !== undefined ? setOwn(px) : setRule(px))} label={label} />
    <div className="sp-scope" role="radiogroup" aria-label="Applies to">
      <button type="button" role="radio" aria-checked={own === undefined} className={own === undefined ? 'on' : ''} onClick={() => setOwn(undefined)} data-tip={`The rule “${ruleInfo.label}”, across the whole guide`}>Everywhere</button>
      <button type="button" role="radio" aria-checked={own !== undefined} className={own !== undefined ? 'on' : ''} onClick={() => setOwn(v)} data-tip="Only here; the rule stays as it is">Only here</button>
    </div>
    {own !== undefined ? <p className="sp-note">The guide’s rule is {spaceName(sys.space[rule])}</p> : null}
  </div>;
}

/** Choose a text style for one text: shows each style in its own type */
export function TypePick({ sys, value, auto, set, onEdit }: { sys: GuideSystem; value?: TypeId; auto: TypeId; set: (id: TypeId | undefined) => void; onEdit: (id: TypeId) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', off); return () => document.removeEventListener('mousedown', off); }, [open]);
  const cur = value || auto, d = sys.type[cur];
  return <div className="tp" ref={ref}>
    <button type="button" className="tp-btn" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
      <span className="tp-id">{typeLabel(cur)}</span><span className="tp-name">{d.name}{!value ? <i> · default here</i> : null}</span><span className="tp-meta">{d.size}</span><ChevronDown size={14} strokeWidth={1.75} aria-hidden />
    </button>
    {open ? <div className="tp-list" role="listbox" aria-label="Text styles">
      {TYPE_IDS.map((id) => { const x = sys.type[id]; return <button type="button" role="option" aria-selected={cur === id} key={id} className={'tp-opt' + (cur === id ? ' on' : '')} onClick={() => { set(id === auto ? undefined : id); setOpen(false); }}>
        <span className="tp-id">{typeLabel(id)}</span><span className="tp-prev" style={{ ...css(x), fontSize: Math.min(22, x.size) }}>{x.name}</span><span className="tp-meta">{x.size}{id === auto ? ' · default' : ''}</span>
      </button>; })}
      <button type="button" className="tp-edit" onClick={() => { setOpen(false); onEdit(cur); }}>Edit text styles…</button>
    </div> : null}
  </div>;
}

export function StylesWindow({ sys, setSys, fonts, colours, auto, focus, onAddFont, onClose }: {
  sys: GuideSystem; setSys: (s: GuideSystem, key?: string) => void; fonts: ToolbarFont[]; colours: { name: string; hex: string }[];
  /** The styles as the guidelines give them, to reset to */ auto: GuideSystem; focus?: TypeId | null; onAddFont: (then: (role: string) => void) => void; onClose: () => void;
}) {
  const [edit, setEdit] = useState<TypeId | null>(focus || null);
  const [tab, setTab] = useState<'type' | 'space'>('type');
  useEffect(() => { if (focus) { setEdit(focus); setTab('type'); } }, [focus]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (edit) setEdit(null); else onClose(); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [edit, onClose]);
  const setType = (id: TypeId, p: Partial<TypeDef>, key?: string) => setSys({ ...sys, edited: true, type: { ...sys.type, [id]: { ...sys.type[id], ...p } } }, key && `ts:${id}:${key}`);
  const d = edit ? sys.type[edit] : null;
  const font = d ? fonts.find((f) => f.role === d.font) : undefined;
  const weights = font?.weights.length ? font.weights : [300, 400, 500, 600, 700];
  const changed = JSON.stringify(sys.type) !== JSON.stringify(auto.type) || JSON.stringify(sys.space) !== JSON.stringify(auto.space);

  return <div className="sw" role="dialog" aria-label="Styles">
    {edit && d ? <div className="sw-edit" role="group" aria-label={`Edit ${typeLabel(edit)}`}>
      <div className="sw-top"><button type="button" className="sw-ic" onClick={() => setEdit(null)} aria-label="Back to all styles"><ChevronLeft {...I} /></button><strong>Edit text style</strong><span className="sw-id">{typeLabel(edit)}</span><span style={{ flex: 1 }} /><button type="button" className="sw-ic" onClick={() => setType(edit, auto.type[edit])} aria-label="Reset this style to the guidelines" data-tip="Reset to the guidelines"><RotateCcw {...I} /></button><button type="button" className="sw-ic" onClick={onClose} aria-label="Close"><X {...I} /></button></div>
      <p className="sw-prev" style={{ ...css(d), fontSize: Math.min(64, d.size) }}>{d.name}</p>
      <label className="sw-f"><span>Name</span><input className="sw-in" value={d.name} onChange={(e) => setType(edit, { name: e.target.value }, 'name')} /></label>
      <p className="sw-h">Properties</p>
      <label className="sw-f"><span className="sr">Typeface</span>
        <select className="sw-in" value={d.font} onChange={(e) => { if (e.target.value === '__add') { onAddFont((role) => setType(edit, { font: role })); return; } const f = fonts.find((x) => x.role === e.target.value); setType(edit, { font: e.target.value, ...(f && f.weights.length && !f.weights.includes(d.weight) ? { weight: f.weights.reduce((a, w) => (Math.abs(w - d.weight) < Math.abs(a - d.weight) ? w : a), f.weights[0]) } : {}) }); }} aria-label="Typeface">
          {fonts.map((f) => <option key={f.role} value={f.role}>{f.name || f.label} ({f.label})</option>)}
          {!fonts.some((f) => f.role === d.font) ? <option value={d.font}>{d.font}</option> : null}
          <option value="__add">Upload a typeface…</option>
        </select></label>
      <div className="sw-2">
        <select className="sw-in" value={d.weight} onChange={(e) => setType(edit, { weight: Number(e.target.value) })} aria-label="Weight">{(weights.includes(d.weight) ? weights : [...weights, d.weight].sort((a, b) => a - b)).map((w) => <option key={w} value={w}>{WEIGHT_NAME[w] || w}</option>)}</select>
        <div className="sw-size"><input className="sw-in" type="number" min={8} max={240} value={d.size} onChange={(e) => e.target.value && setType(edit, { size: Math.max(8, Math.min(240, Number(e.target.value))) }, 'size')} aria-label="Size in pixels" />
          <select className="sw-in" value="" onChange={(e) => e.target.value && setType(edit, { size: Number(e.target.value) })} aria-label="Pick a size"><option value="" disabled /> {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
      </div>
      <div className="sw-2 sw-lab"><span>Line height</span><span>Letter spacing</span></div>
      <div className="sw-2">
        <label className="sw-in sw-unit"><input type="number" step={5} min={70} max={250} value={Math.round(d.leading * 100)} onChange={(e) => e.target.value && setType(edit, { leading: Number(e.target.value) / 100 }, 'leading')} aria-label="Line height in percent" /><i>%</i></label>
        <label className="sw-in sw-unit"><input type="number" step={0.5} min={-10} max={30} value={Math.round(d.tracking * 1000) / 10} onChange={(e) => setType(edit, { tracking: (Number(e.target.value) || 0) / 100 }, 'tracking')} aria-label="Letter spacing in percent" /><i>%</i></label>
      </div>
      <label className="sw-f"><span>Case</span><select className="sw-in" value={d.case || ''} onChange={(e) => setType(edit, { case: (e.target.value || undefined) as TextCase | undefined })}>{CASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <p className="sw-use">Used for: {TYPE_USE[edit]}</p>
    </div> : null}

    <div className="sw-main">
      <div className="sw-top"><strong>Styles</strong><span className="sw-sub">Across the whole guide</span><span style={{ flex: 1 }} /><button type="button" className="sw-ic" onClick={onClose} aria-label="Close"><X {...I} /></button></div>
      <div className="sw-tabs" role="tablist"><button role="tab" aria-selected={tab === 'type'} className={tab === 'type' ? 'on' : ''} onClick={() => setTab('type')}>Text</button><button role="tab" aria-selected={tab === 'space'} className={tab === 'space' ? 'on' : ''} onClick={() => setTab('space')}>Spacing</button></div>
      {tab === 'type' ? <div className="sw-list">
        {TYPE_IDS.map((id) => { const x = sys.type[id]; return <button type="button" key={id} className={'sw-row' + (edit === id ? ' on' : '')} onClick={() => setEdit(id)} title={TYPE_USE[id]}>
          <span className="sw-row-id">{typeLabel(id)}</span><span className="sw-row-prev" style={{ ...css(x), fontSize: Math.max(12, Math.min(40, x.size * 0.55 + 6)) }}>{x.name}</span><span className="sw-row-meta">{fontName(fonts, x.font)} · {x.size}</span>
        </button>; })}
        {!fonts.length ? <button type="button" className="sw-add" onClick={() => onAddFont(() => {})}><Upload {...I} />Upload the brand’s typefaces</button> : null}
      </div> : <div className="sw-list">
        {SPACE_RULES.map((r) => <div key={r.id} className="sw-sp"><span className="sw-sp-t"><b>{r.label}</b><span>{r.help}</span></span><SpaceSelect value={sys.space[r.id]} set={(px) => setSys({ ...sys, edited: true, space: { ...sys.space, [r.id]: px } }, 'sp:' + r.id)} label={r.label} /></div>)}
        <p className="sw-note">Every space comes from one scale: {SPACE_STEPS.filter((s) => s.px).map((s) => s.px).join(' · ')}. A section can still set its own.</p>
      </div>}
      {colours.length ? <><p className="sw-h">Colours</p><div className="sw-cols">{colours.slice(0, 16).map((c) => <span key={c.hex} className="sw-col" style={{ background: c.hex }} title={`${c.name} ${c.hex}`} />)}</div><p className="sw-note">From the brand’s colour chapter.</p></> : null}
      <div className="sw-foot">{changed ? <button type="button" className="sw-reset" onClick={() => setSys({ ...auto, edited: false })}><RotateCcw {...I} />Reset all to the guidelines</button> : <span className="sw-note">Generated from the guidelines and the typefaces uploaded.</span>}</div>
    </div>
  </div>;
}
