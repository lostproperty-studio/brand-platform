'use client';
import type { Block, BlockKind, GuideChapter } from '@/lib/portal/guide';
import type { BlockItem, BoxStyle } from '@/lib/figma/blocks';
import { BOXES, KINDS, KindIcon, convert } from '@/components/GuideEditor';
import type { Sel } from '@/components/GuideDock';
import {
  AlignEndHorizontal, AlignCenterHorizontal, AlignStartHorizontal, ArrowLeft, ArrowRight, ArrowRightToLine, Copy, GalleryHorizontal, ImageOff, ImagePlus,
  ImageUp, Images, LayoutGrid, Minus, PanelLeft, PanelRight, Plus, RectangleHorizontal, Scan, Square, SquareDashed, Trash2, WrapText, Columns3, MousePointerClick,
  ArrowLeftRight, ArrowUpDown, type LucideIcon
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
export function Inspector({ sel, setSel, ch, colours, editBlock, pickImage }: {
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
  const span = b.kind === 'grid' ? Math.min(gcols, it?.w || 2) : Math.min(cols, it?.w || 1);

  return (
    <aside className="dp" aria-label="Design panel" onMouseDown={(e) => { const t = e.target as HTMLElement; if (!t.closest('input, select')) e.preventDefault(); }}>
      <section className="dp-sec" aria-label="Layout">
        <p className="dp-h"><KindIcon k={b.kind} />{KINDS.find(([k]) => k === b.kind)?.[1] || 'Section'}</p>
        {itemish ? <Row label="Layout"><Seg value={b.kind} opts={ITEM_KINDS} set={(k) => set(convert(b, k))} label="Layout" /></Row>
          : <Row label="Layout"><select className="dp-select" value={b.kind} onChange={(e) => set(convert(b, e.target.value as BlockKind))} aria-label="Layout">{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Row>}

        {b.kind === 'columns' ? <>
          <Row label="Columns" hint="How many columns make a full row"><Step value={cols} min={1} max={6} set={(n) => set({ cols: n }, 'cols')} label="Columns" /></Row>
          <Row label="Flow" hint="Wrap onto new rows, or keep every box on one row"><Seg value={flow.wrap === false ? 'row' : 'wrap'} opts={[['wrap', 'Wrap onto new rows', WrapText], ['row', 'One row', ArrowRightToLine]]} set={(v) => setFlow({ wrap: v === 'wrap' })} label="Flow" /></Row>
          <Row label="Width" hint="Equal: every box is one column wide. Fill: boxes stretch to fill the row, including the last one."><Seg value={flow.width || 'equal'} opts={[['equal', 'Equal'], ['fill', 'Fill']]} set={(v) => setFlow({ width: v })} label="Width" /></Row>
          <Row label="Height" hint="Fill: boxes in a row match the tallest. Hug: each box fits its content."><Seg value={flow.height || 'fill'} opts={[['fill', 'Fill'], ['hug', 'Hug']]} set={(v) => setFlow({ height: v })} label="Height" /></Row>
          {flow.height === 'hug' ? <Row label="Align"><Seg value={flow.align || 'start'} opts={[['start', 'Top', AlignStartHorizontal], ['center', 'Middle', AlignCenterHorizontal], ['end', 'Bottom', AlignEndHorizontal]]} set={(v) => setFlow({ align: v })} label="Align" /></Row> : null}
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
        {b.kind === 'columns' || b.kind === 'grid' || (b.kind === 'carousel' && b.variant !== 'images') ? <Row label="Boxes" hint="How each box is held: free, corner marks, outline or a light fill"><Seg value={b.box || (b.kind === 'carousel' ? 'fill' : 'none')} opts={BOXES.map(([v, l]) => [v, l, BOX_ICON[v]] as [BoxStyle, string, LucideIcon])} set={(v) => set({ box: v })} label="Boxes" /></Row> : null}
        {b.kind === 'media' ? <Row label="Per row"><Step value={b.cols || 2} min={1} max={4} set={(n) => set({ cols: n })} label="Images per row" /></Row> : null}
        {b.kind === 'split' ? <Row label="Image"><Seg value={b.side || 'right'} opts={[['left', 'Image left', PanelLeft], ['right', 'Image right', PanelRight]]} set={(v) => set({ side: v })} label="Image side" /></Row> : null}
        {b.kind === 'statement' ? <Row label="Panel"><div className="dp-chips">{palette.map((c) => <button type="button" key={c.hex} className={'dp-chip' + (b.bg === c.hex ? ' on' : '')} style={{ background: c.hex }} onClick={() => set({ bg: c.hex })} aria-label={`${c.name} ${c.hex}`} title={`${c.name} ${c.hex}`} />)}<button type="button" className="dp-link" onClick={() => set({ bg: undefined })}>None</button></div></Row> : null}
        {itemish && b.variant !== 'images' ? <button type="button" className="dp-add" onClick={() => { const n = { id: iid(), label: b.kind === 'carousel' ? String(items.length + 1).padStart(2, '0') : 'Label', ...(b.kind === 'carousel' ? { heading: 'A headline for this card' } : { body: 'Text' }), w: b.kind === 'grid' ? 2 : 1, h: 2 }; set({ items: [...items, n] }); setSel({ block: b.id, item: items.length }); }}><Plus {...I} />{b.kind === 'carousel' ? 'Add a card' : 'Add a box'}</button> : null}
      </section>

      {it ? <section className="dp-sec" aria-label="Selected box">
        <p className="dp-h">Box {i! + 1} of {items.length}</p>
        {b.kind === 'columns' || b.kind === 'grid' ? <Row label="Width" hint="How many columns this box spans. Or drag its right edge."><Step value={span} min={1} max={b.kind === 'grid' ? gcols : cols} set={(n) => setItem({ w: n }, 'w')} label="Columns spanned" suffix={` / ${b.kind === 'grid' ? gcols : cols}`} /><button type="button" className={'dp-pill' + (span === (b.kind === 'grid' ? gcols : cols) ? ' on' : '')} onClick={() => setItem({ w: b.kind === 'grid' ? gcols : cols })}>Full</button></Row> : null}
        {b.kind === 'grid' ? <Row label="Height" hint="How many rows this box spans. Or drag its bottom edge."><Step value={it.h || 2} min={1} max={8} set={(n) => setItem({ h: n }, 'h')} label="Rows spanned" /></Row> : null}
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
