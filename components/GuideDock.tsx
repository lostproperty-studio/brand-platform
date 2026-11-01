'use client';
import { useEffect, useState } from 'react';
import type { Block, BlockKind, GuideChapter } from '@/lib/portal/guide';
import type { BlockItem, TextStyle } from '@/lib/figma/blocks';
import { BOXES, KINDS, KindIcon, convert } from '@/components/GuideEditor';

/** What's selected in the editor: a section, and optionally a piece of text, an item or an image inside it. */
export type Sel = { block: string; el?: string; item?: number };

const WEIGHTS: [number, string][] = [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [700, 'Bold']];
const FIELD: Record<string, string> = { eyebrow: 'Label', heading: 'Headline', body: 'Text', label: 'Label' };
const iid = () => 'i-' + Math.random().toString(36).slice(2, 9);

// The editing dock: always at the bottom of the screen. Its tools follow the selection: the section's layout
// and order; the size, weight and colour of the text you clicked; the item or image you clicked.
export function Dock({ sel, setSel, ch, colours, setBlocks, editBlock, pickImage, onReset }: {
  sel: Sel | null; setSel: (s: Sel | null) => void; ch: GuideChapter; colours: { name: string; hex: string }[];
  setBlocks: (b: Block[]) => void; editBlock: (id: string, p: Partial<Block>) => void; pickImage: (block: string, target: number | 'new' | string) => void; onReset: (b: Block) => void;
}) {
  const [pop, setPop] = useState<'layout' | null>(null);
  useEffect(() => { if (!pop) return; const off = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.dk')) setPop(null); }; document.addEventListener('mousedown', off); return () => document.removeEventListener('mousedown', off); }, [pop]);
  const b = sel ? ch.blocks.find((x) => x.id === sel.block) : undefined;
  if (!b || !sel) return <div className="dk" role="toolbar" aria-label="Editing tools"><span className="dk-ctx">Click any section, text or image to edit it</span></div>;

  const i = sel.item;
  const items = b.items || [];
  const it: BlockItem | undefined = i !== undefined ? items[i] : undefined;
  const isText = !!sel.el && !sel.el.startsWith('img:') && !sel.el.startsWith('itemimg:');
  const field = isText ? (sel.el!.includes('.') ? sel.el!.split('.')[1] : sel.el!) : '';
  const imgIdx = sel.el?.startsWith('img:') ? Number(sel.el.slice(4)) : undefined;
  const media = imgIdx !== undefined ? (b.media || [])[imgIdx] : undefined;
  const style: TextStyle = (isText && b.styles?.[sel.el!]) || {};
  const setStyle = (patch: Partial<TextStyle>) => { const next = { ...style, ...patch }; (Object.keys(next) as (keyof TextStyle)[]).forEach((k) => next[k] === undefined && delete next[k]); editBlock(b.id, { styles: { ...(b.styles || {}), [sel.el!]: next } }); };
  const setItems = (l: BlockItem[]) => editBlock(b.id, { items: l });
  const idx = ch.blocks.indexOf(b);
  const move = (d: number) => { const l = [...ch.blocks]; const [x] = l.splice(idx, 1); l.splice(Math.max(0, Math.min(l.length, idx + d)), 0, x); setBlocks(l); };
  const palette = [...new Map([...colours, { name: 'Black', hex: '#000000' }, { name: 'White', hex: '#FFFFFF' }].map((c) => [c.hex.toUpperCase(), c])).values()].slice(0, 12);
  const deleteText = () => {
    if (!isText) return;
    const off = [...new Set([...(b.off || []), sel.el!])];
    if (it) editBlock(b.id, { items: items.map((x, n) => (n === i ? { ...x, [field]: undefined } : x)), off });
    else editBlock(b.id, { [field]: undefined, off } as Partial<Block>);
    setSel({ block: b.id });
  };
  // Empty text isn't shown as a placeholder; add it back from here
  const offFields = (['eyebrow', 'heading', 'body'] as const).filter((f) => !b[f] && !(b.kind === 'divider' && f !== 'heading') && !(b.kind === 'image' && f === 'eyebrow'));
  const ctx = isText ? `${FIELD[field] || 'Text'}${it ? ` · item ${i! + 1}` : ''}` : sel.el?.startsWith('itemimg:') ? `Image · item ${i! + 1}` : media ? 'Image' : KINDS.find(([k]) => k === b.kind)?.[1] || 'Section';
  const seg = <T extends string | number>(cur: T | undefined, opts: [T, string][], set: (v: T) => void, label: string) => <div className="dk-seg" role="group" aria-label={label}>{opts.map(([v, l]) => <button key={String(v)} className={cur === v ? 'on' : ''} aria-pressed={cur === v} onClick={() => set(v)}>{l}</button>)}</div>;

  return (
    <div className="dk" role="toolbar" aria-label="Editing tools" onMouseDown={(e) => { if (!(e.target as HTMLElement).closest('input')) e.preventDefault(); }}>
      <span className="dk-ctx">{ctx}</span>

      {isText ? <div className="dk-grp" aria-label="Text">
        <span className="dk-lab">Size</span>
        <button onClick={() => setStyle({ size: Math.max(8, (style.size || 16) - 2) })} aria-label="Smaller">−</button>
        <input className="dk-num" type="number" min={8} max={200} value={style.size || ''} placeholder="Auto" aria-label="Text size in pixels" onChange={(e) => setStyle({ size: e.target.value ? Number(e.target.value) : undefined })} />
        <button onClick={() => setStyle({ size: Math.min(200, (style.size || 16) + 2) })} aria-label="Larger">+</button>
        {seg(style.weight, WEIGHTS, (v) => setStyle({ weight: v === style.weight ? undefined : v }), 'Weight')}
        <span className="dk-lab">Colour</span>
        <div className="dk-chips">{palette.map((c) => <button key={c.hex} className={'dk-chip' + (style.color === c.hex ? ' on' : '')} style={{ background: c.hex }} onClick={() => setStyle({ color: c.hex })} aria-label={`${c.name} ${c.hex}`} title={`${c.name} ${c.hex}`} />)}<button className="dk-auto" onClick={() => setStyle({ color: undefined })} aria-label="Default colour">Auto</button></div>
        <button className="dk-danger" onClick={deleteText}>Delete text</button>
      </div> : null}

      {it ? <div className="dk-grp" aria-label="Item">
        <button onClick={() => { const l = [...items]; const [x] = l.splice(i!, 1); l.splice(Math.max(0, i! - 1), 0, x); setItems(l); setSel({ block: b.id, item: Math.max(0, i! - 1), el: sel.el }); }} disabled={i === 0} aria-label="Move item earlier">←</button>
        <button onClick={() => { const l = [...items]; const [x] = l.splice(i!, 1); l.splice(Math.min(items.length - 1, i! + 1), 0, x); setItems(l); setSel({ block: b.id, item: Math.min(items.length - 1, i! + 1), el: sel.el }); }} disabled={i === items.length - 1} aria-label="Move item later">→</button>
        {b.kind === 'grid' ? <>
          <span className="dk-lab">W</span><button onClick={() => setItems(items.map((x, n) => (n === i ? { ...x, w: Math.max(1, (x.w || 2) - 1) } : x)))} aria-label="Narrower">−</button><span className="dk-val">{it.w || 2}</span><button onClick={() => setItems(items.map((x, n) => (n === i ? { ...x, w: Math.min(6, (x.w || 2) + 1) } : x)))} aria-label="Wider">+</button>
          <span className="dk-lab">H</span><button onClick={() => setItems(items.map((x, n) => (n === i ? { ...x, h: Math.max(1, (x.h || 2) - 1) } : x)))} aria-label="Shorter">−</button><span className="dk-val">{it.h || 2}</span><button onClick={() => setItems(items.map((x, n) => (n === i ? { ...x, h: Math.min(8, (x.h || 2) + 1) } : x)))} aria-label="Taller">+</button>
        </> : null}
        <button onClick={() => pickImage(b.id, `item:${i}`)}>{it.media ? 'Replace image' : '+ Image'}</button>
        {it.media ? <button onClick={() => { setItems(items.map((x, n) => (n === i ? { ...x, media: undefined } : x))); setSel({ block: b.id, item: i }); }}>Remove image</button> : null}
        {(['label', 'heading', 'body'] as const).filter((f) => !it[f]).map((f) => <button key={f} onClick={() => { setItems(items.map((x, n) => (n === i ? { ...x, [f]: f === 'heading' ? 'Headline' : f === 'label' ? 'Label' : 'Text' } : x))); editBlock(b.id, { off: (b.off || []).filter((k) => k !== `${it.id}.${f}`) }); }}>+ {FIELD[f]}</button>)}
        <button onClick={() => setItems([...items.slice(0, i! + 1), { ...it, id: iid() }, ...items.slice(i! + 1)])}>Duplicate item</button>
        <button className="dk-danger" onClick={() => { setItems(items.filter((_, n) => n !== i)); setSel({ block: b.id }); }}>Delete item</button>
      </div> : null}

      {media ? <div className="dk-grp" aria-label="Image">
        <button onClick={() => pickImage(b.id, imgIdx!)}>Replace</button>
        <button onClick={() => editBlock(b.id, { media: (b.media || []).map((x, n) => (n === imgIdx ? { ...x, kind: x.kind === 'photo' ? 'graphic' : 'photo' } : x)) })}>{media.kind === 'photo' ? 'Fit' : 'Fill'}</button>
        {media.caption === undefined ? <button onClick={() => editBlock(b.id, { media: (b.media || []).map((x, n) => (n === imgIdx ? { ...x, caption: '' } : x)) })}>+ Caption</button> : null}
        <button className="dk-danger" onClick={() => { editBlock(b.id, { media: (b.media || []).filter((_, n) => n !== imgIdx) }); setSel({ block: b.id }); }}>Delete image</button>
      </div> : null}

      <div className="dk-grp" aria-label="Section">
        <div className="dk-pop-wrap">
          <button onClick={() => setPop(pop === 'layout' ? null : 'layout')} aria-expanded={pop === 'layout'}><KindIcon k={b.kind} />{KINDS.find(([k]) => k === b.kind)?.[1] || 'Layout'} ▴</button>
          {pop === 'layout' ? <div className="dk-pop" role="menu">{KINDS.map(([k, l]) => <button key={k} role="menuitem" className={b.kind === k ? 'on' : ''} onClick={() => { editBlock(b.id, convert(b, k as BlockKind)); setPop(null); }}><KindIcon k={k} />{l}</button>)}</div> : null}
        </div>
        {b.kind === 'columns' ? seg(b.cols || 3, [[2, '2'], [3, '3'], [4, '4']], (v) => editBlock(b.id, { cols: v }), 'Columns') : null}
        {b.kind === 'media' ? seg(b.cols || 2, [[1, '1'], [2, '2'], [3, '3'], [4, '4']], (v) => editBlock(b.id, { cols: v }), 'Columns') : null}
        {b.kind === 'columns' || b.kind === 'grid' ? seg(b.box || 'none', BOXES, (v) => editBlock(b.id, { box: v }), 'Containers') : null}
        {b.kind === 'split' ? seg(b.side || 'right', [['left', 'Image left'], ['right', 'Image right']], (v) => editBlock(b.id, { side: v }), 'Image side') : null}
        {b.kind === 'statement' ? <div className="dk-chips" aria-label="Panel colour"><span className="dk-lab">Panel</span>{palette.map((c) => <button key={c.hex} className={'dk-chip' + (b.bg === c.hex ? ' on' : '')} style={{ background: c.hex }} onClick={() => editBlock(b.id, { bg: c.hex })} aria-label={`Panel ${c.name}`} />)}<button className="dk-auto" onClick={() => editBlock(b.id, { bg: undefined })}>None</button></div> : null}
        {offFields.map((f) => <button key={f} onClick={() => editBlock(b.id, { off: (b.off || []).filter((k) => k !== f), [f]: FIELD[f] } as Partial<Block>)}>+ {FIELD[f]}</button>)}
        {['split', 'media', 'image'].includes(b.kind) ? <button onClick={() => pickImage(b.id, 'new')}>+ Image</button> : null}
        {b.kind === 'columns' || b.kind === 'grid' ? <button onClick={() => editBlock(b.id, { items: [...items, { id: iid(), label: 'Label', body: 'Text', w: 2, h: 2 }] })}>+ Item</button> : null}
        <span className="dk-sep" />
        <button onClick={() => move(-1)} disabled={idx === 0} aria-label="Move section up">↑</button>
        <button onClick={() => move(1)} disabled={idx === ch.blocks.length - 1} aria-label="Move section down">↓</button>
        <button onClick={() => { const l = [...ch.blocks]; const copy = { ...b, id: 'b-' + Math.random().toString(36).slice(2, 10), source: undefined, edited: true }; l.splice(idx + 1, 0, copy); setBlocks(l); setSel({ block: copy.id }); }}>Duplicate</button>
        {b.source && b.edited ? <button onClick={() => onReset(b)}>Reset</button> : null}
        <button onClick={() => editBlock(b.id, { hidden: !b.hidden })}>{b.hidden ? 'Show' : 'Hide'}</button>
        <button className="dk-danger" onClick={() => { if (b.source) editBlock(b.id, { hidden: true }); else setBlocks(ch.blocks.filter((x) => x.id !== b.id)); setSel(null); }}>Delete section</button>
      </div>
      <button className="dk-x" onClick={() => setSel(null)} aria-label="Done editing">Done</button>
    </div>
  );
}
