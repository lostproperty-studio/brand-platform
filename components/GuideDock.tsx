'use client';
import { useEffect, useState } from 'react';
import type { Block, BlockKind, GuideChapter } from '@/lib/portal/guide';
import type { BlockItem, BoxStyle, TextCase, TextStyle } from '@/lib/figma/blocks';
import { BOXES, KINDS, KindIcon, convert } from '@/components/GuideEditor';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Baseline, Captions, ChevronDown, ChevronRight, Columns2, Columns3, Columns4, Copy, Eye, EyeOff,
  ImageOff, ImagePlus, ImageUp, Maximize2, Minimize2, Minus, MoreHorizontal, MoveHorizontal, MoveVertical, PaintBucket, PanelLeft, PanelRight,
  Plus, Redo2, RotateCcw, CaseSensitive, Type, Upload, ArrowLeftRight, ArrowUpDown, Scan, Square, SquareDashed, Trash2, Undo2, X, type LucideIcon
} from 'lucide-react';

/** What's selected in the editor: a section, and optionally a piece of text, an item or an image inside it. */
export type Sel = { block: string; el?: string; item?: number };
/** The chapter's own label, title and introduction are selected as this block id */
export const CHAPTER = '__chapter';
/** Typefaces with files uploaded to the project, and the weights uploaded for each */
export type ToolbarFont = { role: string; label: string; name: string; weights: number[] };
const CASES: [TextCase, string][] = [['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['sentence', 'Sentence case'], ['title', 'Title Case']];
const CH_FIELD: Record<string, string> = { kicker: 'Label', title: 'Title', lede: 'Introduction' };

const WEIGHT_NAME: Record<number, string> = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };
const pct = (n?: number) => (n === undefined ? '' : String(Math.round(n * 1000) / 10));
const FIELD: Record<string, string> = { eyebrow: 'Label', heading: 'Headline', body: 'Text', label: 'Label' };
const FilledSquare = ((p: React.ComponentProps<typeof Square>) => <Square {...p} fill="currentColor" fillOpacity={0.3} />) as unknown as LucideIcon;
const BOX_ICON: Record<BoxStyle, LucideIcon> = { none: SquareDashed, corners: Scan, outline: Square, fill: FilledSquare };
const iid = () => 'i-' + Math.random().toString(36).slice(2, 9);
const I = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;

/** An icon button with a tooltip, as in Docs, Notion or Figma. */
function Btn({ icon: Ic, tip, onClick, on, disabled, danger, children }: { icon?: LucideIcon; tip: string; onClick: () => void; on?: boolean; disabled?: boolean; danger?: boolean; children?: React.ReactNode }) {
  return <button type="button" className={'tb-btn' + (on ? ' on' : '') + (danger ? ' danger' : '') + (children ? ' wide' : '')} onClick={onClick} disabled={disabled} aria-label={tip} aria-pressed={on} data-tip={tip}>{Ic ? <Ic {...I} /> : null}{children}</button>;
}

/** A toolbar button that opens a menu. Defined once, so menus with inputs keep focus while you type. */
function Pop({ id, pop, setPop, label, icon, children, tip }: { id: string; pop: string | null; setPop: (p: string | null) => void; label?: React.ReactNode; icon?: React.ReactNode; tip: string; children: React.ReactNode }) {
  return <div className="tb-pop-wrap">
    <button type="button" className={'tb-btn wide' + (pop === id ? ' on' : '')} onClick={() => setPop(pop === id ? null : id)} aria-expanded={pop === id} aria-haspopup="menu" aria-label={tip} data-tip={pop === id ? undefined : tip}>{icon}{label}<ChevronDown size={14} strokeWidth={1.75} aria-hidden /></button>
    {pop === id ? <div className={'tb-pop' + (id === 'more' ? ' right' : '')} role="menu">{children}</div> : null}
  </div>;
}

// The editing toolbar: fixed above the page, like Google Docs. Undo and redo are always there; the rest follows the
// selection: the text you clicked (size, weight, colour), the item or image, and the section (layout and order).
export function Toolbar({ sel, setSel, ch, colours, fonts, onAddFont, setChStyle, setBlocks, editBlock, pickImage, onReset, onDelete, undo, redo, canUndo, canRedo }: {
  sel: Sel | null; setSel: (s: Sel | null) => void; ch: GuideChapter; colours: { name: string; hex: string }[];
  fonts: ToolbarFont[]; onAddFont: (then: (role: string) => void) => void; setChStyle: (field: string, s: TextStyle, key?: string) => void;
  setBlocks: (b: Block[]) => void; editBlock: (id: string, p: Partial<Block>, key?: string) => void; pickImage: (block: string, target: number | 'new' | string) => void;
  onReset: (b: Block) => void; onDelete: (b: Block) => void; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
}) {
  const [pop, setPop] = useState<string | null>(null);
  useEffect(() => { if (!pop) return; const off = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.tb-pop-wrap')) setPop(null); }; const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPop(null); document.addEventListener('mousedown', off); document.addEventListener('keydown', esc); return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); }; }, [pop]);
  useEffect(() => setPop(null), [sel?.block, sel?.el]);
  const b = sel ? ch.blocks.find((x) => x.id === sel.block) : undefined;
  const history = <div className="tb-grp"><Btn icon={Undo2} tip="Undo (⌘Z)" onClick={undo} disabled={!canUndo} /><Btn icon={Redo2} tip="Redo (⇧⌘Z)" onClick={redo} disabled={!canRedo} /></div>;
  const keep = (e: React.MouseEvent) => { if (!(e.target as HTMLElement).closest('input')) e.preventDefault(); };

  const palette = [...new Map([...colours, { name: 'Black', hex: '#000000' }, { name: 'White', hex: '#FFFFFF' }].map((c) => [c.hex.toUpperCase(), c])).values()].slice(0, 16);
  const chips = (cur: string | undefined, set: (hex?: string) => void, none: string) => <div className="tb-chips">{palette.map((c) => <button type="button" key={c.hex} className={'tb-chip' + (cur === c.hex ? ' on' : '')} style={{ background: c.hex }} onClick={() => { set(c.hex); setPop(null); }} aria-label={`${c.name} ${c.hex}`} title={`${c.name} ${c.hex}`} />)}<button type="button" className="tb-menu-item" onClick={() => { set(undefined); setPop(null); }}>{none}</button></div>;

  // Text: typeface (only those uploaded to the project), size, weight (only weights uploaded), spacing, case, colour
  const textTools = (style: TextStyle, setStyle: (p: Partial<TextStyle>, key?: string) => void, del?: () => void) => {
    const font = fonts.find((f) => f.role === style.font);
    const weights = [...new Set((font ? font.weights : fonts.flatMap((f) => f.weights)))].sort((a, z) => a - z);
    const weightList = weights.length ? weights : [300, 400, 500, 700];
    return <div className="tb-grp" aria-label="Text">
      <Pop pop={pop} setPop={setPop} id="font" tip="Typeface" icon={<Type {...I} />} label={<span className="tb-fontname">{font ? font.name || font.label : 'Default'}</span>}>
        <p className="tb-menu-h">Typefaces on this project</p>
        <button type="button" role="menuitemradio" aria-checked={!style.font} className={'tb-menu-item' + (!style.font ? ' on' : '')} onClick={() => { setStyle({ font: undefined }); setPop(null); }}>Default for this text</button>
        {fonts.map((f) => <button type="button" key={f.role} role="menuitemradio" aria-checked={style.font === f.role} className={'tb-menu-item' + (style.font === f.role ? ' on' : '')} style={{ fontFamily: `var(--font-${f.role})` }} onClick={() => { setStyle({ font: f.role, ...(style.weight && !f.weights.includes(style.weight) ? { weight: undefined } : {}) }); setPop(null); }}>{f.name || f.label}<span className="tb-menu-note">{f.label}</span></button>)}
        {!fonts.length ? <p className="tb-menu-empty">No typefaces uploaded yet.</p> : null}
        <span className="tb-menu-sep" />
        <button type="button" className="tb-menu-item" onClick={() => { setPop(null); onAddFont((role) => setStyle({ font: role })); }}><Upload {...I} />Upload a typeface…</button>
      </Pop>
      <Btn icon={Minus} tip="Smaller" onClick={() => setStyle({ size: Math.max(8, (style.size || 16) - 2) }, 'size')} />
      <input className="tb-num" type="number" min={8} max={240} value={style.size || ''} placeholder="Auto" aria-label="Text size in pixels" title="Text size (px)" onChange={(e) => setStyle({ size: e.target.value ? Number(e.target.value) : undefined }, 'size')} />
      <Btn icon={Plus} tip="Larger" onClick={() => setStyle({ size: Math.min(240, (style.size || 16) + 2) }, 'size')} />
      <Pop pop={pop} setPop={setPop} id="weight" tip="Weight" label={style.weight ? WEIGHT_NAME[style.weight] || style.weight : 'Weight'}>
        {weightList.map((w) => <button type="button" key={w} role="menuitemradio" aria-checked={style.weight === w} className={'tb-menu-item' + (style.weight === w ? ' on' : '')} style={{ fontWeight: w, fontFamily: font ? `var(--font-${font.role})` : undefined }} onClick={() => { setStyle({ weight: w }); setPop(null); }}>{WEIGHT_NAME[w] || w}</button>)}
        <button type="button" className="tb-menu-item" onClick={() => { setStyle({ weight: undefined }); setPop(null); }}>Default</button>
      </Pop>
      <Pop pop={pop} setPop={setPop} id="spacing" tip="Tracking and line height" icon={<ArrowLeftRight {...I} />}>
        <label className="tb-field"><ArrowLeftRight {...I} /><span>Tracking</span><input className="tb-num" type="number" step={0.5} min={-20} max={50} value={pct(style.tracking)} placeholder="0" onChange={(e) => setStyle({ tracking: e.target.value === '' ? undefined : Number(e.target.value) / 100 }, 'tracking')} /><i>%</i></label>
        <label className="tb-field"><ArrowUpDown {...I} /><span>Line height</span><input className="tb-num" type="number" step={5} min={60} max={300} value={style.leading ? Math.round(style.leading * 100) : ''} placeholder="Auto" onChange={(e) => setStyle({ leading: e.target.value ? Number(e.target.value) / 100 : undefined }, 'leading')} /><i>%</i></label>
        <button type="button" className="tb-menu-item" onClick={() => { setStyle({ tracking: undefined, leading: undefined }); setPop(null); }}>Reset spacing</button>
      </Pop>
      <Pop pop={pop} setPop={setPop} id="case" tip="Case" icon={<CaseSensitive {...I} />}>
        <button type="button" role="menuitemradio" aria-checked={!style.case} className={'tb-menu-item' + (!style.case ? ' on' : '')} onClick={() => { setStyle({ case: undefined }); setPop(null); }}>As written</button>
        {CASES.map(([c, l]) => <button type="button" key={c} role="menuitemradio" aria-checked={style.case === c} className={'tb-menu-item' + (style.case === c ? ' on' : '')} onClick={() => { setStyle({ case: c }); setPop(null); }}>{l}</button>)}
      </Pop>
      <Pop pop={pop} setPop={setPop} id="color" tip="Text colour" icon={<span className="tb-colour"><Baseline {...I} /><i style={{ background: style.color || 'currentColor' }} /></span>}>{chips(style.color, (hex) => setStyle({ color: hex }), 'Default colour')}</Pop>
      {del ? <Btn icon={Trash2} tip="Delete this text" danger onClick={del} /> : null}
    </div>;
  };
  const clean = (o: TextStyle) => { (Object.keys(o) as (keyof TextStyle)[]).forEach((k) => o[k] === undefined && delete o[k]); return o; };

  // The chapter's label, title and introduction: text tools only
  if (sel?.block === CHAPTER && sel.el) {
    const field = sel.el;
    const style = ch.styles?.[field] || {};
    return <div className="tb" role="toolbar" aria-label="Editing tools" onMouseDown={keep}>{history}
      <span className="tb-ctx"><span className="tb-crumb">Chapter heading</span><ChevronRight size={14} strokeWidth={1.75} aria-hidden /><span className="tb-crumb on">{CH_FIELD[field] || 'Text'}</span></span>
      {textTools(style, (p, key) => setChStyle(field, clean({ ...style, ...p }), key))}
      <div className="tb-grp tb-end"><Btn icon={X} tip="Deselect (Esc)" onClick={() => setSel(null)} /></div>
    </div>;
  }

  if (!b || !sel) return <div className="tb" role="toolbar" aria-label="Editing tools" onMouseDown={keep}>{history}<span className="tb-ctx tb-empty">Select a section, text or image to edit it</span></div>;

  const i = sel.item;
  const items = b.items || [];
  const it: BlockItem | undefined = i !== undefined ? items[i] : undefined;
  const isText = !!sel.el && !sel.el.startsWith('img:') && !sel.el.startsWith('itemimg:');
  const field = isText ? (sel.el!.includes('.') ? sel.el!.split('.')[1] : sel.el!) : '';
  const imgIdx = sel.el?.startsWith('img:') ? Number(sel.el.slice(4)) : undefined;
  const media = imgIdx !== undefined ? (b.media || [])[imgIdx] : undefined;
  const style: TextStyle = (isText && b.styles?.[sel.el!]) || {};
  const setStyle = (patch: Partial<TextStyle>, key?: string) => editBlock(b.id, { styles: { ...(b.styles || {}), [sel.el!]: clean({ ...style, ...patch }) } }, key && `${sel.el}:${key}`);
  const setItems = (l: BlockItem[]) => editBlock(b.id, { items: l });
  const idx = ch.blocks.indexOf(b);
  const move = (d: number) => { const l = [...ch.blocks]; const [x] = l.splice(idx, 1); l.splice(Math.max(0, Math.min(l.length, idx + d)), 0, x); setBlocks(l); };
  const deleteText = () => {
    if (!isText) return;
    const off = [...new Set([...(b.off || []), sel.el!])];
    if (it) editBlock(b.id, { items: items.map((x, n) => (n === i ? { ...x, [field]: undefined } : x)), off });
    else editBlock(b.id, { [field]: undefined, off } as Partial<Block>);
    setSel({ block: b.id });
  };
  const offFields = (['eyebrow', 'heading', 'body'] as const).filter((f) => !b[f] && !(b.kind === 'divider' && f !== 'heading') && !(b.kind === 'image' && f === 'eyebrow'));
  const kindLabel = KINDS.find(([k]) => k === b.kind)?.[1] || 'Section';
  const inner = isText || !!it || !!media || !!sel.el;
  const ctx = isText ? `${FIELD[field] || 'Text'}${it ? ` · item ${i! + 1}` : ''}` : sel.el?.startsWith('itemimg:') ? `Image · item ${i! + 1}` : media ? 'Image' : it ? `Item ${i! + 1}` : kindLabel;
  const seg = <T extends string | number>(cur: T | undefined, opts: [T, string, LucideIcon?][], set: (v: T) => void, label: string) => <div className="tb-seg" role="group" aria-label={label}>{opts.map(([v, l, Ic]) => <button type="button" key={String(v)} className={'tb-btn' + (cur === v ? ' on' : '') + (Ic ? '' : ' wide')} aria-pressed={cur === v} aria-label={`${label}: ${l}`} data-tip={`${label}: ${l}`} onClick={() => set(v)}>{Ic ? <Ic {...I} /> : l}</button>)}</div>;
  const addable: { label: string; run: () => void }[] = [
    ...offFields.map((f) => ({ label: FIELD[f], run: () => editBlock(b.id, { off: (b.off || []).filter((k) => k !== f), [f]: FIELD[f] } as Partial<Block>) })),
    ...(['split', 'media', 'image'].includes(b.kind) ? [{ label: 'Image', run: () => pickImage(b.id, 'new') }] : []),
    ...(b.kind === 'columns' || b.kind === 'grid' ? [{ label: 'Item', run: () => editBlock(b.id, { items: [...items, { id: iid(), label: 'Label', body: 'Text', w: 2, h: 2 }] }) }] : [])
  ];
  const itemAdd = it ? (['label', 'heading', 'body'] as const).filter((f) => !it[f]) : [];

  return (
    <div className="tb" role="toolbar" aria-label="Editing tools" onMouseDown={keep}>
      {history}
      {/* Where you are, as a breadcrumb: click the section to get its layout tools */}
      <span className="tb-ctx">{inner ? <button type="button" className="tb-crumb" onClick={() => setSel({ block: b.id })} data-tip="Select the whole section"><KindIcon k={b.kind} />{kindLabel}</button> : <span className="tb-crumb on">Section</span>}{inner ? <><ChevronRight size={14} strokeWidth={1.75} aria-hidden /><span className="tb-crumb on">{ctx}</span></> : null}</span>

      {isText ? textTools(style, setStyle, deleteText) : null}

      {it && isText ? <div className="tb-grp" aria-label="Item"><Pop pop={pop} setPop={setPop} id="item" tip="Item tools" label={`Item ${i! + 1}`}><div className="tb-pop-row">
        <Btn icon={ArrowLeft} tip="Move item earlier" disabled={i === 0} onClick={() => { const l = [...items]; const [x] = l.splice(i!, 1); l.splice(Math.max(0, i! - 1), 0, x); setItems(l); setSel({ block: b.id, item: Math.max(0, i! - 1), el: sel.el }); }} />
        <Btn icon={ArrowRight} tip="Move item later" disabled={i === items.length - 1} onClick={() => { const l = [...items]; const [x] = l.splice(i!, 1); l.splice(Math.min(items.length - 1, i! + 1), 0, x); setItems(l); setSel({ block: b.id, item: Math.min(items.length - 1, i! + 1), el: sel.el }); }} />
        {b.kind === 'grid' ? <>
          <span className="tb-step" data-tip="Width, in grid columns"><MoveHorizontal {...I} /><button type="button" onClick={() => setItems(items.map((x, n) => (n === i ? { ...x, w: Math.max(1, (x.w || 2) - 1) } : x)))} aria-label="Narrower">−</button><b>{it.w || 2}</b><button type="button" onClick={() => setItems(items.map((x, n) => (n === i ? { ...x, w: Math.min(6, (x.w || 2) + 1) } : x)))} aria-label="Wider">+</button></span>
          <span className="tb-step" data-tip="Height, in rows"><MoveVertical {...I} /><button type="button" onClick={() => setItems(items.map((x, n) => (n === i ? { ...x, h: Math.max(1, (x.h || 2) - 1) } : x)))} aria-label="Shorter">−</button><b>{it.h || 2}</b><button type="button" onClick={() => setItems(items.map((x, n) => (n === i ? { ...x, h: Math.min(8, (x.h || 2) + 1) } : x)))} aria-label="Taller">+</button></span>
        </> : null}
        <Btn icon={it.media ? ImageUp : ImagePlus} tip={it.media ? 'Replace image' : 'Add an image'} onClick={() => pickImage(b.id, `item:${i}`)} />
        {it.media ? <Btn icon={ImageOff} tip="Remove image" onClick={() => { setItems(items.map((x, n) => (n === i ? { ...x, media: undefined } : x))); setSel({ block: b.id, item: i }); }} /> : null}
        {itemAdd.length ? <Pop pop={pop} setPop={setPop} id="itemadd" tip="Add text to this item" icon={<Plus {...I} />}>{itemAdd.map((f) => <button type="button" key={f} className="tb-menu-item" onClick={() => { setItems(items.map((x, n) => (n === i ? { ...x, [f]: f === 'heading' ? 'Headline' : f === 'label' ? 'Label' : 'Text' } : x))); editBlock(b.id, { off: (b.off || []).filter((k) => k !== `${it.id}.${f}`) }); setPop(null); }}>{FIELD[f]}</button>)}</Pop> : null}
        <Btn icon={Copy} tip="Duplicate item" onClick={() => setItems([...items.slice(0, i! + 1), { ...it, id: iid() }, ...items.slice(i! + 1)])} />
        <Btn icon={Trash2} tip="Delete item" danger onClick={() => { setItems(items.filter((_, n) => n !== i)); setSel({ block: b.id }); }} />
      </div></Pop></div> : it ? <div className="tb-grp" aria-label="Item">
        <Btn icon={ArrowLeft} tip="Move item earlier" disabled={i === 0} onClick={() => { const l = [...items]; const [x] = l.splice(i!, 1); l.splice(Math.max(0, i! - 1), 0, x); setItems(l); setSel({ block: b.id, item: Math.max(0, i! - 1), el: sel.el }); }} />
        <Btn icon={ArrowRight} tip="Move item later" disabled={i === items.length - 1} onClick={() => { const l = [...items]; const [x] = l.splice(i!, 1); l.splice(Math.min(items.length - 1, i! + 1), 0, x); setItems(l); setSel({ block: b.id, item: Math.min(items.length - 1, i! + 1), el: sel.el }); }} />
        {b.kind === 'grid' ? <>
          <span className="tb-step" data-tip="Width, in grid columns"><MoveHorizontal {...I} /><button type="button" onClick={() => setItems(items.map((x, n) => (n === i ? { ...x, w: Math.max(1, (x.w || 2) - 1) } : x)))} aria-label="Narrower">−</button><b>{it.w || 2}</b><button type="button" onClick={() => setItems(items.map((x, n) => (n === i ? { ...x, w: Math.min(6, (x.w || 2) + 1) } : x)))} aria-label="Wider">+</button></span>
          <span className="tb-step" data-tip="Height, in rows"><MoveVertical {...I} /><button type="button" onClick={() => setItems(items.map((x, n) => (n === i ? { ...x, h: Math.max(1, (x.h || 2) - 1) } : x)))} aria-label="Shorter">−</button><b>{it.h || 2}</b><button type="button" onClick={() => setItems(items.map((x, n) => (n === i ? { ...x, h: Math.min(8, (x.h || 2) + 1) } : x)))} aria-label="Taller">+</button></span>
        </> : null}
        <Btn icon={it.media ? ImageUp : ImagePlus} tip={it.media ? 'Replace image' : 'Add an image'} onClick={() => pickImage(b.id, `item:${i}`)} />
        {it.media ? <Btn icon={ImageOff} tip="Remove image" onClick={() => { setItems(items.map((x, n) => (n === i ? { ...x, media: undefined } : x))); setSel({ block: b.id, item: i }); }} /> : null}
        {itemAdd.length ? <Pop pop={pop} setPop={setPop} id="itemadd" tip="Add text to this item" icon={<Plus {...I} />}>{itemAdd.map((f) => <button type="button" key={f} className="tb-menu-item" onClick={() => { setItems(items.map((x, n) => (n === i ? { ...x, [f]: f === 'heading' ? 'Headline' : f === 'label' ? 'Label' : 'Text' } : x))); editBlock(b.id, { off: (b.off || []).filter((k) => k !== `${it.id}.${f}`) }); setPop(null); }}>{FIELD[f]}</button>)}</Pop> : null}
        <Btn icon={Copy} tip="Duplicate item" onClick={() => setItems([...items.slice(0, i! + 1), { ...it, id: iid() }, ...items.slice(i! + 1)])} />
        <Btn icon={Trash2} tip="Delete item" danger onClick={() => { setItems(items.filter((_, n) => n !== i)); setSel({ block: b.id }); }} />
      </div> : null}

      {media ? <div className="tb-grp" aria-label="Image">
        <Btn icon={ImageUp} tip="Replace image" onClick={() => pickImage(b.id, imgIdx!)} />
        <Btn icon={media.kind === 'photo' ? Minimize2 : Maximize2} tip={media.kind === 'photo' ? 'Fit the whole image' : 'Fill the frame'} onClick={() => editBlock(b.id, { media: (b.media || []).map((x, n) => (n === imgIdx ? { ...x, kind: x.kind === 'photo' ? 'graphic' : 'photo' } : x)) })} />
        <Btn icon={Captions} tip={media.caption === undefined ? 'Add a caption' : 'Caption added'} disabled={media.caption !== undefined} onClick={() => editBlock(b.id, { media: (b.media || []).map((x, n) => (n === imgIdx ? { ...x, caption: '' } : x)) })} />
        <Btn icon={Trash2} tip="Delete image" danger onClick={() => { editBlock(b.id, { media: (b.media || []).filter((_, n) => n !== imgIdx) }); setSel({ block: b.id }); }} />
      </div> : null}

      {!inner ? <div className="tb-grp" aria-label="Section">
        <Pop pop={pop} setPop={setPop} id="layout" tip="Change layout" icon={<KindIcon k={b.kind} />} label={kindLabel}>
          {KINDS.map(([k, l]) => <button type="button" key={k} role="menuitemradio" aria-checked={b.kind === k} className={'tb-menu-item' + (b.kind === k ? ' on' : '')} onClick={() => { editBlock(b.id, convert(b, k as BlockKind)); setPop(null); }}><KindIcon k={k} />{l}</button>)}
        </Pop>
        {b.kind === 'columns' ? seg(b.cols || 3, [[2, '2 columns', Columns2], [3, '3 columns', Columns3], [4, '4 columns', Columns4]], (v) => editBlock(b.id, { cols: v }), 'Columns') : null}
        {b.kind === 'media' ? seg(b.cols || 2, [[1, '1'], [2, '2'], [3, '3'], [4, '4']], (v) => editBlock(b.id, { cols: v }), 'Images per row') : null}
        {b.kind === 'columns' || b.kind === 'grid' ? seg(b.box || 'none', BOXES.map(([v, l]) => [v, l, BOX_ICON[v]] as [BoxStyle, string, LucideIcon]), (v) => editBlock(b.id, { box: v }), 'Containers') : null}
        {b.kind === 'split' ? seg(b.side || 'right', [['left', 'Image left', PanelLeft], ['right', 'Image right', PanelRight]], (v) => editBlock(b.id, { side: v }), 'Image side') : null}
        {b.kind === 'statement' ? <Pop pop={pop} setPop={setPop} id="panel" tip="Panel colour" icon={<span className="tb-colour"><PaintBucket {...I} /><i style={{ background: b.bg || 'transparent' }} /></span>}>{chips(b.bg, (hex) => editBlock(b.id, { bg: hex }), 'No panel')}</Pop> : null}
        {addable.length ? <Pop pop={pop} setPop={setPop} id="add" tip="Add to this section" icon={<Plus {...I} />} label="Add">{addable.map((a) => <button type="button" key={a.label} className="tb-menu-item" onClick={() => { a.run(); setPop(null); }}>{a.label}</button>)}</Pop> : null}
      </div> : null}

      <div className="tb-grp tb-end" aria-label="Arrange">
        <Btn icon={b.hidden ? EyeOff : Eye} tip={b.hidden ? 'Hidden from the client. Show it' : 'Hide from the client'} on={b.hidden} onClick={() => editBlock(b.id, { hidden: !b.hidden })} />
        <Pop pop={pop} setPop={setPop} id="more" tip="More section actions" icon={<MoreHorizontal {...I} />}>
          <button type="button" className="tb-menu-item" disabled={idx === 0} onClick={() => { move(-1); setPop(null); }}><ArrowUp {...I} />Move up</button>
          <button type="button" className="tb-menu-item" disabled={idx === ch.blocks.length - 1} onClick={() => { move(1); setPop(null); }}><ArrowDown {...I} />Move down</button>
          <button type="button" className="tb-menu-item" onClick={() => { const l = [...ch.blocks]; const copy = { ...b, id: 'b-' + Math.random().toString(36).slice(2, 10), source: undefined, edited: true }; l.splice(idx + 1, 0, copy); setBlocks(l); setSel({ block: copy.id }); setPop(null); }}><Copy {...I} />Duplicate section</button>
          {b.source && b.edited ? <button type="button" className="tb-menu-item" onClick={() => { onReset(b); setPop(null); }}><RotateCcw {...I} />Reset to the Figma version</button> : null}
          <span className="tb-menu-sep" />
          <button type="button" className="tb-menu-item danger" onClick={() => { onDelete(b); setPop(null); }}><Trash2 {...I} />Delete section</button>
        </Pop>
        <span className="tb-sep" />
        <Btn icon={X} tip="Deselect (Esc)" onClick={() => setSel(null)} />
      </div>
    </div>
  );
}
