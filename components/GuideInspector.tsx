'use client';
import type { Block, BlockKind, GuideChapter } from '@/lib/portal/guide';
import type { BlockItem, BoxAlign, BoxStyle } from '@/lib/figma/blocks';
import { BOXES, KINDS, KindIcon, convert } from '@/components/GuideEditor';
import type { Sel } from '@/components/GuideDock';
import {
  AlignEndHorizontal, AlignCenterHorizontal, AlignStartHorizontal, ArrowLeft, ArrowRight, Copy, GalleryHorizontal, ImageOff, ImagePlus,
  ImageUp, Images, LayoutGrid, Minus, PanelLeft, PanelRight, Plus, RectangleHorizontal, Scan, Square, SquareDashed, Trash2, Columns3, MousePointerClick,
  ArrowLeftRight, ArrowUpDown, UnfoldVertical, Tag, Heading, Type, Rows3, type LucideIcon
} from 'lucide-react';

const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
const FilledSquare = ((p: React.ComponentProps<typeof Square>) => <Square {...p} fill="currentColor" fillOpacity={0.3} />) as unknown as LucideIcon;
const BOX_ICON: Record<BoxStyle, LucideIcon> = { none: SquareDashed, corners: Scan, outline: Square, fill: FilledSquare };
const iid = () => 'i-' + Math.random().toString(36).slice(2, 9);
const ITEM_KINDS: [BlockKind, string, LucideIcon][] = [['columns', 'Stack', Columns3], ['grid', 'Grid', LayoutGrid], ['carousel', 'Carousel', GalleryHorizontal]];

/** A labelled row, as in Figma's design panel */
function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <div className="dp-row"><span className="dp-lab" title={hint}>{label}</span><div className="dp-ctl">{children}</div></div>;
}
/** Segmented control with icons or short words */
function Seg<T extends string | number>({ value, opts, set, label }: { value: T; opts: [T, string, LucideIcon?][]; set: (v: T) => void; label: string }) {
  return <div className="dp-seg" role="radiogroup" aria-label={label}>{opts.map(([v, l, Ic]) => <button type="button" key={String(v)} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => set(v)} aria-label={l} data-tip={Ic ? l : undefined}>{Ic ? <Ic {...I} /> : l}</button>)}</div>;
}
/** A pixel value you can type, or step with − and +; empty means the layout's default */
function Px({ value, placeholder, set, label, icon: Ic, step = 4 }: { value?: number; placeholder: number; set: (n: number | undefined) => void; label: string; icon: LucideIcon; step?: number }) {
  const v = value ?? placeholder;
  return <div className="dp-px" role="group" aria-label={label} data-tip={label}>
    <Ic {...I} />
    <input type="number" min={0} max={200} step={step} value={value ?? ''} placeholder={String(placeholder)} onChange={(e) => set(e.target.value === '' ? undefined : Math.max(0, Math.min(200, Number(e.target.value))))} aria-label={`${label} in pixels`} />
    <span className="dp-px-btns"><button type="button" onClick={() => set(Math.min(200, v + step))} aria-label={`More ${label.toLowerCase()}`}><Plus size={11} strokeWidth={2} aria-hidden /></button><button type="button" onClick={() => set(Math.max(0, v - step))} aria-label={`Less ${label.toLowerCase()}`}><Minus size={11} strokeWidth={2} aria-hidden /></button></span>
  </div>;
}

/** Figma's alignment grid: click a cell to place the content there; double-click to spread it out evenly */
function AlignGrid({ value, set, label }: { value?: BoxAlign; set: (a: BoxAlign | undefined) => void; label: string }) {
  const X = ['start', 'center', 'end'] as const, Y = ['start', 'center', 'end'] as const;
  const x = value?.x || 'start', y = value?.y || 'start', between = y === 'between';
  const NAME = { start: ['left', 'top'], center: ['centre', 'middle'], end: ['right', 'bottom'] } as const;
  return <div className={'dp-align' + (value ? ' set' : '')} role="radiogroup" aria-label={`${label}. Double-click to spread the content out evenly`}>
    {Y.map((yy) => X.map((xx) => {
      const on = xx === x && (between || yy === y);
      return <button type="button" key={yy + xx} role="radio" aria-checked={on && !between ? true : on} aria-label={between ? `Spread out, aligned ${NAME[xx][0]}` : `${NAME[yy][1]} ${NAME[xx][0]}`}
        className={on ? 'on' + (between ? ' between' : '') : ''} onClick={() => set({ x: xx, y: yy })} onDoubleClick={() => set({ x: xx, y: between && xx === x ? yy : 'between' })}>
        {on ? <span className={'dp-bars x-' + xx}><i /><i /><i /></span> : <span className="dp-dot" />}
      </button>;
    }))}
  </div>;
}

/** − n + stepper */
function Step({ value, min, max, set, label, suffix }: { value: number; min: number; max: number; set: (n: number) => void; label: string; suffix?: string }) {
  return <div className="dp-step" role="group" aria-label={label}>
    <button type="button" onClick={() => set(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}><Minus {...I} /></button>
    <span aria-live="polite">{value}{suffix ? <i>{suffix}</i> : null}</span>
    <button type="button" onClick={() => set(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}><Plus {...I} /></button>
  </div>;
}

// The design panel on the right, like Figma's or Framer's: the selected section's layout (how many columns, whether
// the stack wraps, whether boxes fill the space or hug their content, gap, alignment, containers), and below it the
// selected item (how many columns and rows it spans, its order, its image).
export function Inspector({ onAddToBox, sel, setSel, ch, colours, editBlock, pickImage }: {
  onAddToBox?: (block: string, item: number, what: 'label' | 'headline' | 'text' | 'spacer') => void;
  sel: Sel | null; setSel: (s: Sel | null) => void; ch: GuideChapter; colours: { name: string; hex: string }[];
  editBlock: (id: string, p: Partial<Block>, key?: string) => void; pickImage: (block: string, target: number | 'new' | string) => void;
}) {
  const b = sel ? ch.blocks.find((x) => x.id === sel.block) : undefined;
  if (!b || !sel) return <aside className="dp" aria-label="Design panel"><div className="dp-empty"><MousePointerClick size={20} strokeWidth={1.5} aria-hidden /><p>Select a section to set its layout. Click a box inside it to size and order that box.</p></div></aside>;

  const items = b.items || [];
  const set = (p: Partial<Block>, key?: string) => editBlock(b.id, p, key);
  const flow = b.flow || {};
  const setFlow = (p: Partial<NonNullable<Block['flow']>>) => set({ flow: { ...flow, ...p } });
  const itemish = b.kind === 'columns' || b.kind === 'grid' || b.kind === 'carousel';
  const cols = Math.max(1, Math.min(6, b.cols || items.length || 2));
  const gcols = b.gridCols || 6;
  const palette = [...new Map([...colours, { name: 'Black', hex: '#000000' }, { name: 'White', hex: '#FFFFFF' }].map((c) => [c.hex.toUpperCase(), c])).values()].slice(0, 16);
  const i = sel.item, it: BlockItem | undefined = i !== undefined ? items[i] : undefined;
  const setItem = (p: Partial<BlockItem>, key?: string) => set({ items: items.map((x, n) => (n === i ? { ...x, ...p } : x)) }, key);
  const moveItem = (d: number) => { if (i === undefined) return; const l = [...items]; const [x] = l.splice(i, 1); const to = Math.max(0, Math.min(items.length - 1, i + d)); l.splice(to, 0, x); set({ items: l }); setSel({ ...sel, item: to, el: sel.el?.includes('.') ? sel.el : undefined }); };
  const spacerEl = it && sel.el?.includes('.') ? it.els?.find((e) => e.id === sel.el!.split('.')[1] && e.kind === 'spacer') : undefined;
  const span = b.kind === 'grid' ? Math.min(gcols, it?.w || 2) : Math.min(cols, it?.w || 1);

  return (
    <aside className="dp" aria-label="Design panel" onMouseDown={(e) => { const t = e.target as HTMLElement; if (!t.closest('input, select')) e.preventDefault(); }}>
      <section className="dp-sec" aria-label="Layout">
        <p className="dp-h"><KindIcon k={b.kind} />{KINDS.find(([k]) => k === b.kind)?.[1] || 'Section'}</p>
        {itemish ? <Row label="Layout"><Seg value={b.kind} opts={ITEM_KINDS} set={(k) => set(convert(b, k))} label="Layout" /></Row>
          : <Row label="Layout"><select className="dp-select" value={b.kind} onChange={(e) => set(convert(b, e.target.value as BlockKind))} aria-label="Layout">{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Row>}

        {b.kind === 'columns' ? <>
          <Row label="Direction" hint="Side by side as columns, or stacked as rows. Add a box with the + between boxes."><Seg value={flow.dir === 'col' ? 'col' : 'row'} opts={[['row', 'Columns', Columns3], ['col', 'Rows', Rows3]]} set={(v) => set({ flow: { ...flow, dir: v, wrap: undefined }, ...(v === 'row' ? { cols: Math.min(6, Math.max(1, items.length)) } : {}) })} label="Direction" /></Row>
          {flow.dir !== 'col' ? <Row label="Height" hint="Fill: boxes in a row match the tallest. Hug: each box fits its content."><Seg value={flow.height || 'fill'} opts={[['fill', 'Fill'], ['hug', 'Hug']]} set={(v) => setFlow({ height: v })} label="Height" /></Row> : null}
          {flow.dir !== 'col' && flow.height === 'hug' ? <Row label="Align"><Seg value={flow.align || 'start'} opts={[['start', 'Top', AlignStartHorizontal], ['center', 'Middle', AlignCenterHorizontal], ['end', 'Bottom', AlignEndHorizontal]]} set={(v) => setFlow({ align: v })} label="Align" /></Row> : null}
<Row label="Spacing" hint="Between columns, and between rows, in pixels. Empty uses the default."><Px value={b.gapX} placeholder={({ s: 10, m: 20, l: 40 } as const)[flow.gap || 'm']} set={(n) => set({ gapX: n }, 'gapX')} label="Space between columns" icon={ArrowLeftRight} /><Px value={b.gapY} placeholder={b.gapX ?? ({ s: 10, m: 20, l: 40 } as const)[flow.gap || 'm']} set={(n) => set({ gapY: n }, 'gapY')} label="Space between rows" icon={ArrowUpDown} /></Row>
          <Row label="Padding" hint="Space inside each box, in pixels"><Px value={b.pad} placeholder={b.box && b.box !== 'none' ? 24 : 0} set={(n) => set({ pad: n }, 'pad')} label="Padding inside boxes" icon={Square} /></Row>
        </> : null}

        {b.kind === 'grid' ? <>
          <Row label="Columns" hint="The grid every box snaps to"><Seg value={gcols} opts={[[4, '4'], [6, '6'], [8, '8'], [12, '12']]} set={(n) => set({ gridCols: n, items: items.map((x) => ({ ...x, w: Math.max(1, Math.round(((x.w || 2) / gcols) * n)) })) })} label="Grid columns" /></Row>
          <Row label="Row height"><Seg value={b.rowH || 'm'} opts={[['s', 'S'], ['m', 'M'], ['l', 'L']]} set={(v) => set({ rowH: v })} label="Row height" /></Row>
<Row label="Spacing" hint="Between columns, and between rows, in pixels. Empty uses the default."><Px value={b.gapX} placeholder={({ s: 6, m: 12, l: 24 } as const)[b.gap || 'm']} set={(n) => set({ gapX: n }, 'gapX')} label="Space between columns" icon={ArrowLeftRight} /><Px value={b.gapY} placeholder={b.gapX ?? ({ s: 6, m: 12, l: 24 } as const)[b.gap || 'm']} set={(n) => set({ gapY: n }, 'gapY')} label="Space between rows" icon={ArrowUpDown} /></Row>
          <Row label="Padding" hint="Space inside each box, in pixels"><Px value={b.pad} placeholder={b.box && b.box !== 'none' ? 24 : 0} set={(n) => set({ pad: n }, 'pad')} label="Padding inside boxes" icon={Square} /></Row>
        </> : null}

        {b.kind === 'carousel' && b.variant !== 'images' ? <Row label="Padding" hint="Space inside each card, in pixels"><Px value={b.pad} placeholder={40} set={(n) => set({ pad: n }, 'pad')} label="Padding inside cards" icon={Square} /></Row> : null}
        {b.kind === 'carousel' ? <Row label="Slides"><Seg value={b.variant || 'cards'} opts={[['cards', 'Cards of text', RectangleHorizontal], ['images', 'Images', Images]]} set={(v) => set(v === 'images' ? { variant: v } : { variant: v, box: b.box && b.box !== 'none' ? b.box : 'fill', items: items.length ? items : [{ id: iid(), label: '01', heading: 'A headline for this card' }] })} label="Slides" /></Row> : null}
        {b.kind === 'columns' || b.kind === 'grid' || (b.kind === 'carousel' && b.variant !== 'images') ? <Row label="In boxes" hint="How the content sits in every box, and the space between its elements. Double-click the grid to spread it out evenly."><div className="dp-alignrow"><AlignGrid value={b.boxAlign} set={(a) => set({ boxAlign: a })} label="Alignment in every box" /><div className="dp-alignside"><Px value={b.boxGap} placeholder={14} set={(n) => set({ boxGap: n }, 'boxGap')} label="Space between elements" icon={ArrowUpDown} />{b.boxAlign || b.boxGap !== undefined ? <button type="button" className="dp-link" onClick={() => set({ boxAlign: undefined, boxGap: undefined })}>Reset</button> : null}</div></div></Row> : null}
        {b.kind === 'columns' || b.kind === 'grid' || (b.kind === 'carousel' && b.variant !== 'images') ? <Row label="Boxes" hint="How each box is held: free, corner marks, outline or a light fill"><Seg value={b.box || (b.kind === 'carousel' ? 'fill' : 'none')} opts={BOXES.map(([v, l]) => [v, l, BOX_ICON[v]] as [BoxStyle, string, LucideIcon])} set={(v) => set({ box: v })} label="Boxes" /></Row> : null}
        {b.kind === 'spacer' ? <Row label="Height" hint="The empty space this spacer makes, in pixels"><Px value={b.size} placeholder={64} step={8} set={(n) => set({ size: n }, 'size')} label="Spacer height" icon={UnfoldVertical} /></Row> : null}
        {b.kind === 'media' ? <Row label="Per row"><Step value={b.cols || 2} min={1} max={4} set={(n) => set({ cols: n })} label="Images per row" /></Row> : null}
        {b.kind === 'split' ? <Row label="Image"><Seg value={b.side || 'right'} opts={[['left', 'Image left', PanelLeft], ['right', 'Image right', PanelRight]]} set={(v) => set({ side: v })} label="Image side" /></Row> : null}
        {b.kind === 'statement' ? <>
          <Row label="Background" hint="A brand colour behind the slide"><div className="dp-chips">{palette.map((c) => <button type="button" key={c.hex} className={'dp-chip' + (b.bg === c.hex ? ' on' : '')} style={{ background: c.hex }} onClick={() => set({ bg: c.hex })} aria-label={`${c.name} ${c.hex}`} title={`${c.name} ${c.hex}`} />)}<button type="button" className="dp-link" onClick={() => set({ bg: undefined })}>None</button></div></Row>
          <Row label="Image" hint="An image behind the text. It fills the slide."><div className="dp-btns"><button type="button" onClick={() => pickImage(b.id, 'backdrop')} aria-label={b.backdrop ? 'Replace background image' : 'Add a background image'} data-tip={b.backdrop ? 'Replace' : 'Add'}>{b.backdrop ? <ImageUp {...I} /> : <ImagePlus {...I} />}</button>{b.backdrop ? <button type="button" onClick={() => set({ backdrop: undefined })} aria-label="Remove background image" data-tip="Remove"><ImageOff {...I} /></button> : null}</div></Row>
          <Row label="Width" hint="Full width runs edge to edge in the client portal"><Seg value={b.full ? 'full' : 'page'} opts={[['page', 'Page'], ['full', 'Full width']]} set={(v) => set({ full: v === 'full' })} label="Width" /></Row>
          <Row label="Shape" hint="Locks the slide to a shape so it doesn’t stretch with the screen. Text scales with it."><select className="dp-select" value={b.ratio || 'auto'} onChange={(e) => set({ ratio: e.target.value === 'auto' ? undefined : (e.target.value as Block['ratio']) })} aria-label="Shape">{[['auto', 'Auto: fits the text'], ['16:9', '16:9 Widescreen'], ['21:9', '21:9 Cinema'], ['3:2', '3:2'], ['4:3', '4:3'], ['1:1', '1:1 Square']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
        </> : null}
        {sel.gap ? <Row label="Space above" hint="The space between this element and the one above it, in pixels"><Px value={b.gapBefore?.[sel.gap]} placeholder={20} step={4} set={(n) => { const g = { ...(b.gapBefore || {}) }; if (n === undefined) delete g[sel.gap!]; else g[sel.gap!] = n; set({ gapBefore: g }, 'gap-' + sel.gap); }} label="Space above" icon={ArrowUpDown} /></Row> : null}
        {itemish && b.variant !== 'images' ? <button type="button" className="dp-add" onClick={() => { const n = { id: iid(), label: b.kind === 'carousel' ? String(items.length + 1).padStart(2, '0') : 'Label', ...(b.kind === 'carousel' ? { heading: 'A headline for this card' } : { body: 'Text' }), w: b.kind === 'grid' ? 2 : 1, h: 2 }; set({ items: [...items, n] }); setSel({ block: b.id, item: items.length }); }}><Plus {...I} />{b.kind === 'carousel' ? 'Add a card' : 'Add a box'}</button> : null}
      </section>

      {it ? <section className="dp-sec" aria-label="Selected box">
        <p className="dp-h">Box {i! + 1} of {items.length}</p>
        {(b.kind === 'columns' && flow.dir !== 'col') || b.kind === 'grid' ? <Row label="Width" hint="How many columns this box spans. Or drag its right edge."><Step value={span} min={1} max={b.kind === 'grid' ? gcols : cols} set={(n) => setItem({ w: n }, 'w')} label="Columns spanned" suffix={` / ${b.kind === 'grid' ? gcols : cols}`} /><button type="button" className={'dp-pill' + (span === (b.kind === 'grid' ? gcols : cols) ? ' on' : '')} onClick={() => setItem({ w: b.kind === 'grid' ? gcols : cols })}>Full</button></Row> : null}
        {b.kind === 'grid' ? <Row label="Height" hint="How many rows this box spans. Or drag its bottom edge."><Step value={it.h || 2} min={1} max={8} set={(n) => setItem({ h: n }, 'h')} label="Rows spanned" /></Row> : null}
        {b.variant !== 'images' ? <Row label="Content" hint="How this box's content sits, overriding the section. Double-click the grid to spread it out evenly."><div className="dp-alignrow"><AlignGrid value={it.align || b.boxAlign} set={(a) => setItem({ align: a })} label="Alignment in this box" /><div className="dp-alignside"><Px value={it.gap} placeholder={b.boxGap ?? 14} set={(n) => setItem({ gap: n }, 'gap')} label="Space between elements" icon={ArrowUpDown} />{it.align || it.gap !== undefined ? <button type="button" className="dp-link" onClick={() => setItem({ align: undefined, gap: undefined })}>Use the section’s</button> : null}</div></div></Row> : null}
        {onAddToBox && b.variant !== 'images' ? <Row label="Add" hint="Add to this box. Or pick a tool in the bar below and point where it goes."><div className="dp-addrow">{([['label', 'Label', Tag], ['headline', 'Headline', Heading], ['text', 'Text', Type], ['spacer', 'Spacer', UnfoldVertical]] as const).map(([w, l, Ic]) => <button type="button" key={w} onClick={() => onAddToBox(b.id, i!, w)} aria-label={`Add ${l.toLowerCase()} to this box`} data-tip={l}><Ic {...I} /></button>)}</div></Row> : null}
        {spacerEl ? <Row label="Spacer" hint="The empty space this spacer makes inside the box, in pixels"><Px value={spacerEl.size} placeholder={32} step={4} set={(n) => setItem({ els: (it.els || []).map((e) => (e.id === spacerEl.id ? { ...e, size: n } : e)) }, 'spacer')} label="Spacer height" icon={UnfoldVertical} /></Row> : null}
        <Row label="Order"><div className="dp-btns"><button type="button" onClick={() => moveItem(-1)} disabled={i === 0} aria-label="Move earlier" data-tip="Earlier"><ArrowLeft {...I} /></button><button type="button" onClick={() => moveItem(1)} disabled={i === items.length - 1} aria-label="Move later" data-tip="Later"><ArrowRight {...I} /></button></div></Row>
        <Row label="Image"><div className="dp-btns"><button type="button" onClick={() => pickImage(b.id, `item:${i}`)} aria-label={it.media ? 'Replace image' : 'Add an image'} data-tip={it.media ? 'Replace' : 'Add'}>{it.media ? <ImageUp {...I} /> : <ImagePlus {...I} />}</button>{it.media ? <button type="button" onClick={() => setItem({ media: undefined })} aria-label="Remove image" data-tip="Remove"><ImageOff {...I} /></button> : null}</div></Row>
        <div className="dp-foot">
          <button type="button" className="dp-act" onClick={() => { set({ items: [...items.slice(0, i! + 1), { ...it, id: iid() }, ...items.slice(i! + 1)] }); setSel({ block: b.id, item: i! + 1 }); }}><Copy {...I} />Duplicate</button>
          <button type="button" className="dp-act danger" onClick={() => { set({ items: items.filter((_, n) => n !== i) }); setSel({ block: b.id }); }}><Trash2 {...I} />Delete box</button>
        </div>
      </section> : itemish && items.length ? <p className="dp-tip">Click a box on the page to size it, or drag its edge.</p> : null}
    </aside>
  );
}
