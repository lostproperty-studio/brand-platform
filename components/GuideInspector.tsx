'use client';
import type { Block, BlockKind, GuideChapter } from '@/lib/portal/guide';
import { fillMedia, itemEls, ratioOf, type BlockItem, type BoxAlign, type BoxStyle, type FrameLook, type ItemEl, type TextStyle } from '@/lib/figma/blocks';
import { KINDS, KindIcon, convert } from '@/components/GuideEditor';
import { CHAPTER, type Sel, type ToolbarFont } from '@/components/GuideDock';
import { TypePanel } from '@/components/TypePanel';
import { FramePanel } from '@/components/FramePanel';
import { ScaleSelect, SpaceCtl } from '@/components/GuideStyles';
import type { GuideSystem, SpaceRule, TypeId } from '@/lib/guideSystem';
import {
  AlignEndHorizontal, AlignCenterHorizontal, AlignStartHorizontal, ArrowLeft, ArrowRight, Captions, Copy, GalleryHorizontal, ImageOff, ImagePlus,
  ImageUp, Images, LayoutGrid, Loader2, Maximize2, Minimize2, Minus, MousePointerClick, PanelLeft, PanelRight, Plus, RectangleHorizontal, Scan, Sparkles, Square, SquareDashed,
  Trash2, UnfoldVertical, Type, Columns3, Rows3, Palette, Shapes, Ban, Video, Image as ImageIcon, type LucideIcon
} from 'lucide-react';

const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
const FilledSquare = ((p: React.ComponentProps<typeof Square>) => <Square {...p} fill="currentColor" fillOpacity={0.3} />) as unknown as LucideIcon;
/** Figma's names: frames hold content; with no stroke or fill they're just a frame */
const FRAME_STYLES: [BoxStyle, string, LucideIcon][] = [['none', 'No stroke', SquareDashed], ['corners', 'Corner marks', Scan], ['outline', 'Stroke', Square], ['fill', 'Fill', FilledSquare]];
/** A frame's size on the page now (unscaled by the canvas zoom), found by selector */
const measureOf = (sel: string) => () => { const n = document.querySelector(`.ve-blocks ${sel}`) as HTMLElement | null; return n && n.offsetWidth ? { w: n.offsetWidth, h: n.offsetHeight } : null; };
const iid = () => 'i-' + Math.random().toString(36).slice(2, 9);
const LAYOUTS: [BlockKind, string, LucideIcon][] = [['columns', 'Auto layout', Columns3], ['grid', 'Grid', LayoutGrid], ['carousel', 'Carousel', GalleryHorizontal]];

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <div className="dp-row"><span className="dp-lab" title={hint}>{label}</span><div className="dp-ctl">{children}</div></div>;
}
function Seg<T extends string | number>({ value, opts, set, label }: { value: T; opts: [T, string, LucideIcon?][]; set: (v: T) => void; label: string }) {
  return <div className="dp-seg" role="radiogroup" aria-label={label}>{opts.map(([v, l, Ic]) => <button type="button" key={String(v)} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => set(v)} aria-label={l} data-tip={Ic ? l : undefined}>{Ic ? <Ic {...I} /> : l}</button>)}</div>;
}
function Px({ value, placeholder, set, label, icon: Ic, step = 4 }: { value?: number; placeholder: number; set: (n: number | undefined) => void; label: string; icon: LucideIcon; step?: number }) {
  const v = value ?? placeholder;
  return <div className="dp-px" role="group" aria-label={label} data-tip={label}>
    <Ic {...I} />
    <input type="number" min={0} max={400} step={step} value={value ?? ''} placeholder={String(placeholder)} onChange={(e) => set(e.target.value === '' ? undefined : Math.max(0, Math.min(400, Number(e.target.value))))} aria-label={`${label} in pixels`} />
    <span className="dp-px-btns"><button type="button" onClick={() => set(Math.min(400, v + step))} aria-label={`More ${label.toLowerCase()}`}><Plus size={11} strokeWidth={2} aria-hidden /></button><button type="button" onClick={() => set(Math.max(0, v - step))} aria-label={`Less ${label.toLowerCase()}`}><Minus size={11} strokeWidth={2} aria-hidden /></button></span>
  </div>;
}
function AlignGrid({ value, set, label }: { value?: BoxAlign; set: (a: BoxAlign | undefined) => void; label: string }) {
  const X = ['start', 'center', 'end'] as const, Y = ['start', 'center', 'end'] as const;
  const x = value?.x || 'start', y = value?.y || 'start', between = y === 'between';
  const NAME = { start: ['left', 'top'], center: ['centre', 'middle'], end: ['right', 'bottom'] } as const;
  return <div className={'dp-align' + (value ? ' set' : '')} role="radiogroup" aria-label={`${label}. Double-click for space between`}>
    {Y.map((yy) => X.map((xx) => {
      const on = xx === x && (between || yy === y);
      return <button type="button" key={yy + xx} role="radio" aria-checked={on} aria-label={between ? `Space between, aligned ${NAME[xx][0]}` : `${NAME[yy][1]} ${NAME[xx][0]}`}
        className={on ? 'on' + (between ? ' between' : '') : ''} onClick={() => set({ x: xx, y: yy })} onDoubleClick={() => set({ x: xx, y: between && xx === x ? yy : 'between' })}>
        {on ? <span className={'dp-bars x-' + xx}><i /><i /><i /></span> : <span className="dp-dot" />}
      </button>;
    }))}
  </div>;
}
function Step({ value, min, max, set, label, suffix }: { value: number; min: number; max: number; set: (n: number) => void; label: string; suffix?: string }) {
  return <div className="dp-step" role="group" aria-label={label}>
    <button type="button" onClick={() => set(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}><Minus {...I} /></button>
    <span aria-live="polite">{value}{suffix ? <i>{suffix}</i> : null}</span>
    <button type="button" onClick={() => set(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}><Plus {...I} /></button>
  </div>;
}
function Chips({ palette, value, set, none = 'None' }: { palette: { name: string; hex: string }[]; value?: string; set: (hex?: string) => void; none?: string }) {
  return <div className="dp-chips">{palette.map((c) => <button type="button" key={c.hex} className={'dp-chip' + (value?.toUpperCase() === c.hex.toUpperCase() ? ' on' : '')} style={{ background: c.hex }} onClick={() => set(c.hex)} aria-label={`${c.name} ${c.hex}`} title={`${c.name} ${c.hex}`} />)}<button type="button" className="dp-link" onClick={() => set(undefined)}>{none}</button></div>;
}
function Sec({ title, icon, children, extra }: { title: string; icon?: React.ReactNode; children: React.ReactNode; extra?: React.ReactNode }) {
  return <section className="dp-sec" aria-label={title}><p className="dp-h">{icon}{title}{extra ? <span className="dp-h-x">{extra}</span> : null}</p>{children}</section>;
}

/** The text style a text has when none is chosen: the one its place in the layout gives it */
export function autoType(b: Block | null, el: string, it?: BlockItem): TypeId {
  if (!b) return el === 'title' ? 'h1' : el === 'lede' ? 'h5' : 'caption';
  if (el.startsWith('x-')) { const x = b.extras?.find((e) => 'x-' + e.id === el); return x?.kind === 'heading' ? 'h3' : x?.kind === 'label' ? 'caption' : 'body'; }
  if (el.includes('.')) {
    const id = el.split('.')[1]; const k = it?.els?.find((e) => e.id === id)?.kind ?? (id === 'label' ? 'label' : id === 'heading' ? 'heading' : 'text');
    const car = b.kind === 'carousel';
    return k === 'label' ? (car ? 'caption' : 'h6') : k === 'heading' ? (car ? 'h3' : 'h4') : 'body';
  }
  if (el === 'eyebrow') return 'caption';
  if (el === 'heading') return ['divider', 'statement', 'cover'].includes(b.kind) || b.headSize === 'XL' ? 'h1' : 'h2';
  if (el === 'body') return b.kind === 'statement' ? 'h5' : 'body';
  return 'body';
}
const partOf = (el: string) => (el === 'heading' || el === 'eyebrow' ? 'head' : el === 'body' ? 'body' : el.startsWith('img:') ? 'media' : el);
const ruleOf = (block: string, part: string) => (typeof document === 'undefined' ? undefined : (document.querySelector(`[data-block="${block}"] [data-part="${part}"]`) as HTMLElement | null)?.dataset.rule as SpaceRule | undefined);

export type InspectorProps = {
  onAddToBox?: (block: string, item: number, what: 'label' | 'headline' | 'text' | 'spacer') => void;
  sel: Sel | null; setSel: (s: Sel | null) => void; ch: GuideChapter; colours: { name: string; hex: string }[];
  editBlock: (id: string, p: Partial<Block>, key?: string) => void; pickImage: (block: string, target: number | 'new' | string) => void;
  sys: GuideSystem; setSys: (s: GuideSystem, key?: string) => void; openStyles: (focus?: TypeId) => void;
  setChStyle?: (field: string, s: TextStyle, key?: string) => void; onFill?: () => void; filling?: boolean; onDelete: () => void;
  fonts?: ToolbarFont[]; onAddFont?: (then: (role: string) => void) => void;
  /** Choose an icon for a frame, or a new one for an icon already there */ onIcon?: (block: string, item: number, replace?: string) => void;
  /** Make an image or video with Krea for a frame's fill */ onMake?: (block: string, target: string, aspect?: string) => void;
};

// The design panel on the right, like Figma's: it shows what you can change about what's selected, and only that.
// Text: its style, colour and the space above it. A frame: its size, padding, gap and alignment. An auto layout:
// direction, gap, padding, frame style and fill. Everything visual is here; the top bar is for history and order.
export function Inspector({ onAddToBox, sel, setSel, ch, colours, editBlock, pickImage, sys, setSys, openStyles, setChStyle, onFill, filling, onDelete, fonts, onAddFont, onIcon, onMake }: InspectorProps) {
  const palette = [...new Map([...colours, { name: 'Black', hex: '#000000' }, { name: 'White', hex: '#FFFFFF' }].map((c) => [c.hex.toUpperCase(), c])).values()].slice(0, 16);
  // Colours already used in this chapter, for the fill picker
  const pageColours = [...new Set((JSON.stringify(ch.blocks).match(/#[0-9a-f]{6}\b/gi) || []).map((h) => h.toUpperCase()))].slice(0, 24);
  const setRule = (rule: SpaceRule, px: number) => setSys({ ...sys, edited: true, space: { ...sys.space, [rule]: px } }, 'sp:' + rule);
  const keep = (e: React.MouseEvent) => { const t = e.target as HTMLElement; if (!t.closest('input, select')) e.preventDefault(); };
  const clean = (o: TextStyle) => { (Object.keys(o) as (keyof TextStyle)[]).forEach((k) => o[k] === undefined && delete o[k]); return o; };

  /** Text: Figma's typography, fill and appearance, starting from one of the guide's styles */
  const typeSec = (style: TextStyle, auto: TypeId, setStyle: (p: Partial<TextStyle>, key?: string) => void, del?: () => void, valign?: Parameters<typeof TypePanel>[0]['valign']) => <>
    <TypePanel style={style} setStyle={setStyle} sys={sys} auto={auto} fonts={fonts || []} onAddFont={onAddFont} palette={palette} openStyles={openStyles} valign={valign} />
    {onFill || del ? <section className="dp-sec"><div className="dp-foot">
      {onFill ? <button type="button" className={'dp-act' + (filling ? ' busy' : '')} onClick={onFill} disabled={filling} data-tip="A first draft from what’s around it">{filling ? <Loader2 {...I} className="spin" /> : <Sparkles {...I} />}{filling ? 'Writing…' : 'Write with AI'}</button> : null}
      {del ? <button type="button" className="dp-act danger" onClick={del}><Trash2 {...I} />Delete <kbd>⌫</kbd></button> : null}
    </div></section> : null}
  </>;

  // The chapter's label, title and introduction
  if (sel?.block === CHAPTER && sel.el && setChStyle) {
    const style = ch.styles?.[sel.el] || {};
    return <aside className="dp" aria-label="Design panel" onMouseDown={keep}>{typeSec(style, autoType(null, sel.el), (p, key) => setChStyle(sel.el!, clean({ ...style, ...p }), key))}</aside>;
  }
  const b = sel ? ch.blocks.find((x) => x.id === sel.block) : undefined;
  if (!b || !sel) return <aside className="dp" aria-label="Design panel"><div className="dp-empty"><MousePointerClick size={20} strokeWidth={1.5} aria-hidden /><p>Select a section, frame, text or image. This panel shows what you can change about it.</p><button type="button" className="dp-act" onClick={() => openStyles()}><Palette {...I} />Text styles and spacing</button></div></aside>;

  const items = b.items || [];
  const set = (p: Partial<Block>, key?: string) => editBlock(b.id, p, key);
  const flow = b.flow || {};
  const setFlow = (p: Partial<NonNullable<Block['flow']>>) => set({ flow: { ...flow, ...p } });
  const itemish = b.kind === 'columns' || b.kind === 'grid' || b.kind === 'carousel';
  const framed = ((sel.item !== undefined ? items[sel.item]?.box : undefined) || b.box || (b.kind === 'carousel' ? 'fill' : 'none')) !== 'none';
  const cols = Math.max(1, Math.min(6, b.cols || items.length || 2));
  const gcols = b.gridCols || 6;
  const i = sel.item, it: BlockItem | undefined = i !== undefined ? items[i] : undefined;
  const setItem = (p: Partial<BlockItem>, key?: string) => set({ items: items.map((x, n) => (n === i ? { ...x, ...p } : x)) }, key);
  const moveItem = (d: number) => { if (i === undefined) return; const l = [...items]; const [x] = l.splice(i, 1); const to = Math.max(0, Math.min(items.length - 1, i + d)); l.splice(to, 0, x); set({ items: l }); setSel({ ...sel, item: to, el: sel.el?.includes('.') ? sel.el : undefined }); };
  const el = sel.el;
  const itemElId = el?.includes('.') ? el.split('.')[1] : undefined;
  const itemElKind = itemElId ? it?.els?.find((e) => e.id === itemElId)?.kind ?? (itemElId === 'media' ? 'image' : itemElId) : undefined;
  const isImg = !!el && (el.startsWith('img:') || el.startsWith('itemimg:') || itemElKind === 'image');
  const spacerEl = itemElKind === 'spacer' && it ? it.els?.find((e) => e.id === itemElId) : undefined;
  const isText = !!el && el !== 'items' && !isImg && !spacerEl && itemElKind !== 'frame' && itemElKind !== 'icon';
  const span = b.kind === 'grid' ? Math.min(gcols, it?.w || 2) : Math.min(cols, it?.w || 1);
  const kindLabel = b.kind === 'columns' ? 'Auto layout' : KINDS.find(([k]) => k === b.kind)?.[1] || 'Section';

  /** The space above a part of the section: the guide's rule for it, or this section's own */
  const spaceAbove = (part: string) => {
    const rule = ruleOf(b.id, part); if (!rule) return null;
    return <Sec title="Spacing"><Row label="Space above"><SpaceCtl sys={sys} rule={rule} own={b.gapBefore?.[part]} setRule={(px) => setRule(rule, px)} setOwn={(px) => { const g = { ...(b.gapBefore || {}) }; if (px === undefined) delete g[part]; else g[part] = px; set({ gapBefore: g }, 'gap-' + part); }} label="Space above" /></Row></Sec>;
  };
  /** A frame in an auto layout or grid: its size, padding, gap and alignment */
  /** A frame: when it's selected, Figma's sections (auto layout, appearance, fill, stroke); when something inside it
   *  is selected, just how that content sits in it */
  const frameSec = (full: boolean) => !it ? null : !full ? <Sec title={`Frame ${i! + 1} of ${items.length}`} icon={<Square {...I} />}>
    {b.variant !== 'images' ? <>
      <Row label="Align" hint="How the content sits in this frame. Double-click for space between."><AlignGrid value={it.align || b.boxAlign} set={(a) => setItem({ align: a })} label="Alignment in this frame" /></Row>
      <Row label="Gap" hint="Between the elements in this frame"><SpaceCtl sys={sys} rule="el-gap" own={it.gap ?? b.boxGap} setRule={(px) => setRule('el-gap', px)} setOwn={(px) => setItem({ gap: px }, 'gap')} label="Gap between elements" /></Row>
      {framed ? <Row label="Padding" hint="Inside this frame"><SpaceCtl sys={sys} rule="box-pad" own={it.pad ?? b.pad} setRule={(px) => setRule('box-pad', px)} setOwn={(px) => setItem({ pad: px }, 'pad')} label="Padding" /></Row> : null}
    </> : null}
  </Sec> : <>
    <Sec title={`Frame ${i! + 1} of ${items.length}`} icon={<Square {...I} />}>
    {b.variant !== 'images' ? <Row label="Style" hint="This frame's own style. Same as the set unless you change it."><Seg value={it.box || b.box || (b.kind === 'carousel' ? 'fill' : 'none')} opts={FRAME_STYLES} set={(v) => setItem({ box: v === (b.box || (b.kind === 'carousel' ? 'fill' : 'none')) ? undefined : v })} label="Frame style" /></Row> : null}
    {full && b.kind === 'grid' ? <Row label="Width" hint="Columns this frame spans, or drag its edge"><Step value={span} min={1} max={b.kind === 'grid' ? gcols : cols} set={(n) => setItem({ w: n }, 'w')} label="Columns spanned" suffix={` / ${b.kind === 'grid' ? gcols : cols}`} /><button type="button" className={'dp-pill' + (span === (b.kind === 'grid' ? gcols : cols) ? ' on' : '')} onClick={() => setItem({ w: b.kind === 'grid' ? gcols : cols })}>Fill</button></Row> : null}
    {full && b.kind === 'grid' ? <Row label="Height" hint="Rows this frame spans, or drag its bottom edge"><Step value={it.h || 2} min={1} max={8} set={(n) => setItem({ h: n }, 'h')} label="Rows spanned" /></Row> : null}
      {onAddToBox && b.variant !== 'images' ? <Row label="Add" hint="Add inside this frame"><div className="dp-addrow">{([['text', 'Text', Type], ['spacer', 'Spacer', UnfoldVertical]] as const).map(([w, l, Ic]) => <button type="button" key={w} onClick={() => onAddToBox(b.id, i!, w)} aria-label={`Add ${l.toLowerCase()} to this frame`} data-tip={l}><Ic {...I} /></button>)}<button type="button" onClick={() => nest(false)} aria-label="Add a frame inside this frame" data-tip="Frame F"><Square {...I} /></button><button type="button" onClick={() => nest(true)} aria-label="Add an image frame" data-tip="Image ⇧⌘K"><ImagePlus {...I} /></button><button type="button" onClick={() => onIcon?.(b.id, i!)} aria-label="Add an icon" data-tip="Icon"><Shapes {...I} /></button></div></Row> : null}
      <Row label="Order" hint="⌘[ and ⌘]"><div className="dp-btns"><button type="button" onClick={() => moveItem(-1)} disabled={i === 0} aria-label="Move earlier" data-tip="Earlier ⌘["><ArrowLeft {...I} /></button><button type="button" onClick={() => moveItem(1)} disabled={i === items.length - 1} aria-label="Move later" data-tip="Later ⌘]"><ArrowRight {...I} /></button></div></Row>
      <div className="dp-foot">
        <button type="button" className="dp-act" onClick={() => { set({ items: [...items.slice(0, i! + 1), { ...it, id: iid() }, ...items.slice(i! + 1)] }); setSel({ block: b.id, item: i! + 1 }); }}><Copy {...I} />Duplicate <kbd>⌘D</kbd></button>
        <button type="button" className="dp-act danger" onClick={onDelete}><Trash2 {...I} />Delete <kbd>⌫</kbd></button>
      </div>
    </Sec>
    {b.variant !== 'images' ? <FramePanel pageColours={pageColours} look={it.look} set={(l, key) => setItem({ look: l }, key && 'look-' + key)} palette={palette} upload={() => pickImage(b.id, `ilook:${i}`)} onMake={onMake ? () => onMake(b.id, `ilook:${i}`, it.look?.ratio) : undefined} measure={measureOf(`[data-block="${b.id}"] [data-item="${i}"]`)} sizing={b.kind === 'columns'} hasContent
      layout={{ align: it.align || b.boxAlign, setAlign: (a) => setItem({ align: a }), gap: it.gap ?? b.boxGap, gapRule: sys.space['el-gap'], setGap: (n) => setItem({ gap: n }, 'gap'), padRule: framed ? sys.space['box-pad'] : 0,
        alignGrid: <AlignGrid value={it.align || b.boxAlign} set={(a) => setItem({ align: a })} label="Alignment in this frame" /> }} /> : null}
  </>;

  /** A frame inside the selected frame; an image one opens the file picker */
  const nest = (image: boolean) => {
    if (!it || i === undefined) return;
    const els = (it.els || itemEls(it)).slice(); const id = 'e-' + Math.random().toString(36).slice(2, 8);
    const ne: ItemEl = { id, kind: 'frame', look: image ? { ratio: '4:3' } : { ratio: '16:9', fill: { type: 'colour', colour: '#EEEEEE' } } };
    set({ items: items.map((x, n) => (n === i ? { ...x, els: [...els, ne], label: undefined, heading: undefined, body: undefined, media: undefined } : x)) });
    setSel({ block: b.id, item: i, el: `${it.id}.${id}` });
    if (image) pickImage(b.id, `look:${i}:${id}`);
  };
  const frameEl = it && itemElId ? it.els?.find((e) => e.id === itemElId && (e.kind === 'frame' || (e.kind === 'image' && !!e.look))) : undefined;

  // ---------- the selection decides the panel
  if (sel.gap) return <aside className="dp" aria-label="Design panel" onMouseDown={keep}>{spaceAbove(sel.gap) || <p className="dp-tip">No space to set here.</p>}</aside>;

  if (isText && el) {
    const style: TextStyle = b.styles?.[el] || {};
    const setStyle = (p: Partial<TextStyle>, key?: string) => set({ styles: { ...(b.styles || {}), [el]: clean({ ...style, ...p }) } }, key && `${el}:${key}`);
    return <aside className="dp" aria-label="Design panel" onMouseDown={keep}>
      {typeSec(style, autoType(b, el, it), setStyle, onDelete, it ? { value: (it.align || b.boxAlign)?.y, set: (y) => setItem({ align: { ...(it.align || b.boxAlign || {}), y } }) } : undefined)}
      {it ? frameSec(false) : spaceAbove(partOf(el))}
    </aside>;
  }

  const iconEl = it && itemElId ? it.els?.find((e) => e.id === itemElId && e.kind === 'icon') : undefined;
  if (iconEl && it && i !== undefined) {
    const setIcon = (p: Partial<ItemEl>, key?: string) => setItem({ els: (it.els || []).map((e) => (e.id === iconEl.id ? { ...e, ...p } : e)) }, key && 'ic-' + key);
    return <aside className="dp" aria-label="Design panel" onMouseDown={keep}>
      <Sec title="Icon" icon={<span className="dp-icprev" style={{ color: iconEl.colour }} dangerouslySetInnerHTML={{ __html: iconEl.icon?.svg || '' }} />}>
        <Row label="Icon"><button type="button" className="dp-act" onClick={() => onIcon?.(b.id, i, iconEl.id)}><Shapes {...I} />Replace {iconEl.icon?.name ? `(${iconEl.icon.name})` : ''}</button></Row>
        <Row label="Size"><Px value={iconEl.size} placeholder={32} step={4} set={(n) => setIcon({ size: n }, 'size')} label="Icon size" icon={Square} /></Row>
        <Row label="Colour"><Chips palette={palette} value={iconEl.colour} set={(c) => setIcon({ colour: c })} none="Text colour" /></Row>
        <p className="dp-tip" style={{ padding: 0 }}>From {iconEl.icon?.set === 'custom' ? 'your own SVG' : `the ${iconEl.icon?.set || 'lucide'} library`}. Change the library in the icon picker.</p>
        <div className="dp-foot"><button type="button" className="dp-act danger" onClick={onDelete}><Trash2 {...I} />Delete <kbd>⌫</kbd></button></div>
      </Sec>
      {frameSec(false)}
    </aside>;
  }
  if (frameEl && it && i !== undefined) {
    const setLook = (l: FrameLook, key?: string) => setItem({ els: (it.els || []).map((e) => (e.id === frameEl.id ? { ...e, look: l } : e)) }, key && 'fl-' + key);
    const m = fillMedia(frameEl.look) || frameEl.media;
    return <aside className="dp" aria-label="Design panel" onMouseDown={keep}>
      <Sec title={m ? (m.video ? 'Video frame' : 'Image frame') : 'Frame'} icon={<Square {...I} />}>
        <div className="dp-foot"><button type="button" className="dp-act danger" onClick={onDelete}><Trash2 {...I} />Delete <kbd>⌫</kbd></button></div>
      </Sec>
      <FramePanel pageColours={pageColours} look={frameEl.look} set={setLook} palette={palette} upload={() => pickImage(b.id, `look:${i}:${frameEl.id}`)} onMake={onMake ? () => onMake(b.id, `look:${i}:${frameEl.id}`, frameEl.look?.ratio) : undefined} measure={measureOf(`[data-block="${b.id}"] [data-item="${i}"] [data-el="${frameEl.id}"] .fr`)} />
    </aside>;
  }
  if (isImg && el) {
    const k = el.startsWith('img:') ? Number(el.slice(4)) : undefined;
    const m = k !== undefined ? (b.media || [])[k] : undefined;
    // A picture in a section is a frame like any other: the same fill, fit, crop, adjustments, corners and stroke
    const look: FrameLook | undefined = m ? { ...(m.look || {}), fill: { type: m.video ? 'video' : 'image', media: m }, fit: m.look?.fit || (m.kind === 'graphic' ? 'fit' : 'fill'), ratio: m.look?.ratio || ratioOf(m.w, m.h) } : undefined;
    const setMediaLook = (l: FrameLook) => { if (k === undefined || !m) return; const fm = l.fill && (l.fill.type === 'image' || l.fill.type === 'video') ? l.fill.media : undefined; const { fill: _f, ...rest } = l;
      set({ media: (b.media || []).map((x, n) => (n === k ? { ...x, ...(fm ? { path: fm.path, w: fm.w, h: fm.h, video: fm.video } : {}), look: rest } : x)) }, 'mlook'); };
    return <aside className="dp" aria-label="Design panel" onMouseDown={keep}>
      <Sec title="Image" icon={<ImagePlus {...I} />}>
        <div className="dp-btns dp-btns-row">
          <button type="button" onClick={() => pickImage(b.id, k !== undefined ? k : `item:${i}`)} aria-label="Replace image" data-tip="Replace ⇧⌘K"><ImageUp {...I} /></button>
          {m ? <button type="button" disabled={m.caption !== undefined} onClick={() => set({ media: (b.media || []).map((x, n) => (n === k ? { ...x, caption: '' } : x)) })} aria-label="Add a caption" data-tip="Caption"><Captions {...I} /></button> : null}
          <button type="button" className="danger" onClick={onDelete} aria-label="Delete image" data-tip="Delete ⌫"><ImageOff {...I} /></button>
        </div>
      </Sec>
      {m && look ? <FramePanel pageColours={pageColours} look={look} set={setMediaLook} palette={palette} upload={() => pickImage(b.id, k!)} sizing={false} /> : null}
      {it ? frameSec(false) : spaceAbove('media')}
    </aside>;
  }

  if (spacerEl && it) return <aside className="dp" aria-label="Design panel" onMouseDown={keep}>
    <Sec title="Spacer" icon={<UnfoldVertical {...I} />}><Row label="Height"><ScaleSelect value={spacerEl.size ?? 28} set={(n) => setItem({ els: (it.els || []).map((e) => (e.id === spacerEl.id ? { ...e, size: n } : e)) }, 'spacer')} label="Spacer height" /></Row></Sec>
    {frameSec(false)}
  </aside>;

  if (it) return <aside className="dp" aria-label="Design panel" onMouseDown={keep}>{frameSec(true)}</aside>;

  // The whole section
  return (
    <aside className="dp" aria-label="Design panel" onMouseDown={keep}>
      <Sec title={kindLabel} icon={<KindIcon k={b.kind} />}>
        {itemish ? <Row label="Layout"><Seg value={b.kind} opts={LAYOUTS} set={(k) => set(convert(b, k))} label="Layout" /></Row>
          : <Row label="Layout"><select className="dp-select" value={b.kind} onChange={(e) => set(convert(b, e.target.value as BlockKind))} aria-label="Layout">{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Row>}
        {b.kind === 'columns' ? <>
          <Row label="Direction" hint="Horizontal or vertical, as in Figma’s auto layout. Add a frame with the + between frames."><Seg value={flow.dir === 'col' ? 'col' : 'row'} opts={[['col', 'Vertical', Rows3], ['row', 'Horizontal', Columns3]]} set={(v) => set({ flow: { ...flow, dir: v, wrap: undefined }, ...(v === 'row' ? { cols: Math.min(6, Math.max(1, items.length)) } : {}) })} label="Direction" /></Row>
          {flow.dir !== 'col' ? <Row label="Height" hint="Fill: frames match the tallest. Hug: each frame fits its content."><Seg value={flow.height || 'fill'} opts={[['hug', 'Hug'], ['fill', 'Fill']]} set={(v) => setFlow({ height: v })} label="Frame height" /></Row> : null}
          {flow.dir !== 'col' && flow.height === 'hug' ? <Row label="Align"><Seg value={flow.align || 'start'} opts={[['start', 'Top', AlignStartHorizontal], ['center', 'Middle', AlignCenterHorizontal], ['end', 'Bottom', AlignEndHorizontal]]} set={(v) => setFlow({ align: v })} label="Align frames" /></Row> : null}
        </> : null}
        {b.kind === 'grid' ? <>
          <Row label="Columns" hint="The grid every frame snaps to"><Seg value={gcols} opts={[[4, '4'], [6, '6'], [8, '8'], [12, '12']]} set={(n) => set({ gridCols: n, items: items.map((x) => ({ ...x, w: Math.max(1, Math.round(((x.w || 2) / gcols) * n)) })) })} label="Grid columns" /></Row>
          <Row label="Row height"><Seg value={b.rowH || 'm'} opts={[['s', 'S'], ['m', 'M'], ['l', 'L']]} set={(v) => set({ rowH: v })} label="Row height" /></Row>
        </> : null}
        {b.kind === 'carousel' ? <Row label="Slides"><Seg value={b.variant || 'cards'} opts={[['cards', 'Frames of text', RectangleHorizontal], ['images', 'Images', Images]]} set={(v) => set(v === 'images' ? { variant: v } : { variant: v, box: b.box && b.box !== 'none' ? b.box : 'fill', items: items.length ? items : [{ id: iid(), label: '01', heading: 'A headline for this card' }] })} label="Slides" /></Row> : null}
        {b.kind === 'spacer' ? <Row label="Height"><ScaleSelect value={b.size ?? 64} set={(n) => set({ size: n }, 'size')} label="Spacer height" /></Row> : null}
        {b.kind === 'media' ? <Row label="Per row"><Step value={b.cols || 2} min={1} max={4} set={(n) => set({ cols: n })} label="Images per row" /></Row> : null}
        {b.kind === 'split' ? <Row label="Image"><Seg value={b.side || 'right'} opts={[['left', 'Image left', PanelLeft], ['right', 'Image right', PanelRight]]} set={(v) => set({ side: v })} label="Image side" /></Row> : null}
        {b.kind === 'statement' ? <>
          <Row label="Width" hint="Full width runs edge to edge in the client portal"><Seg value={b.full ? 'full' : 'page'} opts={[['page', 'Page'], ['full', 'Full width']]} set={(v) => set({ full: v === 'full' })} label="Width" /></Row>
          <Row label="Shape" hint="Locks the slide to a shape so it doesn’t stretch with the screen. Text scales with it."><select className="dp-select" value={b.ratio || 'auto'} onChange={(e) => set({ ratio: e.target.value === 'auto' ? undefined : (e.target.value as Block['ratio']) })} aria-label="Shape">{[['auto', 'Auto: hugs the text'], ['16:9', '16:9 Widescreen'], ['21:9', '21:9 Cinema'], ['3:2', '3:2'], ['4:3', '4:3'], ['1:1', '1:1 Square']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
        </> : null}
      </Sec>

      {itemish && b.variant !== 'images' ? <Sec title="Spacing">
        <Row label="Gap" hint="Between frames"><SpaceCtl sys={sys} rule="box-gap" own={b.gapX} setRule={(px) => setRule('box-gap', px)} setOwn={(px) => set({ gapX: px, gapY: undefined, flow: { ...flow, gap: undefined }, gap: undefined }, 'gapX')} label="Gap between frames" /></Row>
        {framed ? <Row label="Padding" hint="Inside every frame"><SpaceCtl sys={sys} rule="box-pad" own={b.pad} setRule={(px) => setRule('box-pad', px)} setOwn={(px) => set({ pad: px }, 'pad')} label="Padding" /></Row> : null}
        <Row label="Inner gap" hint="Between the elements inside each frame"><SpaceCtl sys={sys} rule="el-gap" own={b.boxGap} setRule={(px) => setRule('el-gap', px)} setOwn={(px) => set({ boxGap: px }, 'boxGap')} label="Gap inside frames" /></Row>
      </Sec> : null}

      {itemish && b.variant !== 'images' ? <Sec title="Frames">
        <Row label="Style"><Seg value={b.box || (b.kind === 'carousel' ? 'fill' : 'none')} opts={FRAME_STYLES} set={(v) => set({ box: v })} label="Frame style" /></Row>
        {b.box === 'fill' || (b.kind === 'carousel' && !b.box) ? <Row label="Fill"><Chips palette={palette} value={b.boxBg} set={(boxBg) => set({ boxBg })} none="Tint" /></Row> : null}
        <Row label="Align" hint="How content sits in every frame. Double-click for space between."><AlignGrid value={b.boxAlign} set={(a) => set({ boxAlign: a })} label="Alignment in every frame" /></Row>
        <button type="button" className="dp-add" onClick={() => { const nb = items[items.length - 1]; const n: BlockItem = { id: iid(), label: b.kind === 'carousel' ? String(items.length + 1).padStart(2, '0') : 'Label', ...(b.kind === 'carousel' || nb?.heading ? { heading: 'A headline' } : {}), ...(b.kind !== 'carousel' ? { body: 'Text' } : {}), w: b.kind === 'grid' ? 2 : 1, h: 2 }; set({ items: [...items, n], ...(b.kind === 'columns' && flow.dir !== 'col' ? { cols: Math.min(6, items.length + 1) } : {}) }); setSel({ block: b.id, item: items.length }); }}><Plus {...I} />Add frame</button>
      </Sec> : null}

      {b.kind === 'statement' ? <Sec title="Fill">
        <Row label="Colour"><Chips palette={palette} value={b.bg} set={(bg) => set({ bg })} /></Row>
        <Row label="Image" hint="Fills the slide, behind the text"><div className="dp-btns"><button type="button" onClick={() => pickImage(b.id, 'backdrop')} aria-label={b.backdrop ? 'Replace the image' : 'Add an image'} data-tip={b.backdrop ? 'Replace' : 'Add'}>{b.backdrop ? <ImageUp {...I} /> : <ImagePlus {...I} />}</button>{b.backdrop ? <button type="button" onClick={() => set({ backdrop: undefined })} aria-label="Remove the image" data-tip="Remove"><ImageOff {...I} /></button> : null}</div></Row>
      </Sec> : null}

      {itemish && items.length ? <p className="dp-tip">Click a frame to size it, or drag its edge. Enter selects the first frame.</p> : null}
    </aside>
  );
}
