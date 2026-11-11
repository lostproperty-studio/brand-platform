'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Columns3, Eye, EyeOff, Frame, GalleryHorizontal, Heading, Image as ImageIcon, LayoutGrid, LayoutPanelTop, MoveVertical, Rows3, Shapes, Tag, Type } from 'lucide-react';
import { itemEls, type BlockItem, type ItemEl } from '@/lib/figma/blocks';
import type { Block } from '@/lib/portal/guide';
import { CHAPTER, type Sel } from '@/components/GuideDock';
import { nodeFor } from '@/components/Collab';

// Layers, as in Figma: the selected section as a tree — its headline and text, its frames, and what's in each frame.
// Click to select (shift to add), double-click to rename, the eye to hide (hidden layers stay in the editor, faded,
// and aren't shown to the client), drag to reorder or to move something into another frame.

export type LayerAt = { i: number; el?: string };
export type LayerDrop = LayerAt & { pos: 'before' | 'after' | 'inside' };
const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;

const clip = (s: string, n = 32) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
export const elName = (e: ItemEl) => e.name || (e.kind === 'frame' ? (e.look?.fill?.type === 'image' ? (e.look.fill.media?.video ? 'Video' : 'Image') : 'Frame')
  : e.kind === 'image' ? 'Image' : e.kind === 'icon' ? (e.icon?.name || 'Icon').replace(/-/g, ' ') : e.kind === 'spacer' ? `Spacer · ${e.size ?? 32}px` : clip(e.text || (e.kind === 'label' ? 'Label' : e.kind === 'heading' ? 'Headline' : 'Text')));
export const itemName = (it: BlockItem, i: number) => it.name || clip(it.label || it.heading || itemEls(it).find((e) => (e.kind === 'label' || e.kind === 'heading') && e.text)?.text || '', 28) || `Frame ${i + 1}`;
const elIcon = (e: ItemEl) => e.kind === 'frame' ? (e.look?.fill?.type === 'image' ? <ImageIcon {...I} /> : <Frame {...I} />) : e.kind === 'image' ? <ImageIcon {...I} /> : e.kind === 'icon' ? <Shapes {...I} /> : e.kind === 'spacer' ? <MoveVertical {...I} /> : e.kind === 'label' ? <Tag {...I} /> : e.kind === 'heading' ? <Heading {...I} /> : <Type {...I} />;
const key = (s: Sel) => `${s.block}|${s.item ?? ''}|${s.el ?? ''}`;

export function LayersPanel({ block, title, sel, multi, select, hide, rename, move }: {
  block?: Block; title: string; sel: Sel | null; multi: Sel[];
  select: (s: Sel, shift: boolean) => void; hide: (at: LayerAt, hidden: boolean) => void; rename: (at: LayerAt, name: string) => void; move: (from: LayerAt, to: LayerDrop) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [drag, setDrag] = useState<LayerAt | null>(null);
  const [over, setOver] = useState<{ k: string; pos: LayerDrop['pos'] } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const items = block?.items || [];
  const picked = new Set([...(multi.length ? multi : sel ? [sel] : [])].map(key));
  // Open the frame that holds the selection, and bring its row into view
  useEffect(() => {
    if (sel?.item !== undefined && block && sel.block === block.id) { const id = items[sel.item]?.id; if (id && !open[id]) setOpen((o) => ({ ...o, [id]: true })); }
    requestAnimationFrame(() => list.current?.querySelector('.ly-row.on')?.scrollIntoView({ block: 'nearest' }));
  }, [sel, block?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Hovering a layer outlines it on the page
  const hover = (s: Sel | null) => { document.querySelectorAll('.ve-lyhover').forEach((x) => x.classList.remove('ve-lyhover')); if (s) nodeFor(s)?.classList.add('ve-lyhover'); };
  useEffect(() => () => hover(null), []);

  if (!block) return <section className="ly" aria-label="Layers"><p className="ly-h">Layers</p><p className="ly-empty">Select a section to see its layers.</p></section>;
  const b = block;

  const row = (o: { k: string; s: Sel; depth: number; icon: React.ReactNode; name: string; hidden?: boolean; at?: LayerAt; kids?: boolean; openKey?: string; drop?: 'item' | 'el' }) => {
    const on = picked.has(key(o.s));
    const dropAt = (e: React.DragEvent): LayerDrop['pos'] => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const y = (e.clientY - r.top) / r.height; return o.drop === 'item' && drag?.el !== undefined ? (y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside') : y < 0.5 ? 'before' : 'after'; };
    const canDrop = !!drag && !!o.at && (drag.el === undefined ? o.drop === 'item' : true) && !(drag.i === o.at.i && drag.el === o.at.el);
    return <div key={o.k} role="treeitem" aria-selected={on} aria-expanded={o.kids ? (o.openKey === '__group' ? open.__group !== false : !!open[o.openKey!]) : undefined}
      className={'ly-row' + (on ? ' on' : '') + (o.hidden ? ' off' : '') + (over?.k === o.k ? ' ov-' + over.pos : '')} style={{ paddingLeft: 6 + o.depth * 14 }}
      draggable={!!o.at && editing !== o.k} onDragStart={(e) => { if (!o.at) return; e.dataTransfer.effectAllowed = 'move'; setDrag(o.at); }} onDragEnd={() => { setDrag(null); setOver(null); }}
      onDragOver={(e) => { if (!canDrop) return; e.preventDefault(); const pos = dropAt(e); if (over?.k !== o.k || over.pos !== pos) setOver({ k: o.k, pos }); }}
      onDragLeave={() => { if (over?.k === o.k) setOver(null); }}
      onDrop={(e) => { e.preventDefault(); if (drag && o.at && canDrop) move(drag, { ...o.at, pos: dropAt(e) }); setDrag(null); setOver(null); }}
      onMouseEnter={() => hover(o.s)} onMouseLeave={() => hover(null)}
      onClick={(e) => { if (editing === o.k) return; select(o.s, e.shiftKey); nodeFor(o.s)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }}
      onDoubleClick={() => { if (o.at) setEditing(o.k); }}>
      {o.kids ? <button type="button" className={'ly-tw' + ((o.openKey === '__group' ? open.__group !== false : open[o.openKey!]) ? ' open' : '')} onClick={(e) => { e.stopPropagation(); setOpen((x) => ({ ...x, [o.openKey!]: o.openKey === '__group' ? x.__group === false : !x[o.openKey!] })); }} aria-label="Expand or collapse"><ChevronRight size={12} strokeWidth={2} aria-hidden /></button> : <span className="ly-tw" />}
      <span className="ly-ic">{o.icon}</span>
      {editing === o.k ? <input className="ly-in" autoFocus defaultValue={o.name} onClick={(e) => e.stopPropagation()} onFocus={(e) => e.target.select()}
        onBlur={(e) => { rename(o.at!, e.target.value.trim()); setEditing(null); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }} />
        : <span className="ly-n" title={o.at ? `${o.name} · double-click to rename, drag to move` : o.name}>{o.name}</span>}
      {o.at ? <button type="button" className={'ly-eye' + (o.hidden ? ' on' : '')} onClick={(e) => { e.stopPropagation(); hide(o.at!, !o.hidden); }} aria-label={o.hidden ? `Show ${o.name}` : `Hide ${o.name}`}>{o.hidden ? <EyeOff {...I} /> : <Eye {...I} />}</button> : null}
    </div>;
  };

  const rows: React.ReactNode[] = [];
  rows.push(row({ k: 'sec', s: { block: b.id }, depth: 0, icon: <LayoutPanelTop {...I} />, name: title }));
  if (b.eyebrow) rows.push(row({ k: 'eb', s: { block: b.id, el: 'eyebrow' }, depth: 1, icon: <Tag {...I} />, name: clip(b.eyebrow) }));
  if (b.heading) rows.push(row({ k: 'hd', s: { block: b.id, el: 'heading' }, depth: 1, icon: <Heading {...I} />, name: clip(b.heading) }));
  if (b.body) rows.push(row({ k: 'bd', s: { block: b.id, el: 'body' }, depth: 1, icon: <Type {...I} />, name: clip(b.body) }));
  // The frames sit inside their auto layout (or grid, or carousel), which can be selected on its own
  const group = ['columns', 'grid', 'carousel'].includes(b.kind) && items.length > 0;
  const groupOpen = open.__group !== false;
  if (group) {
    const vert = b.flow?.dir === 'col';
    rows.push(row({ k: 'grp', s: { block: b.id, el: 'items' }, depth: 1, icon: b.kind === 'grid' ? <LayoutGrid {...I} /> : b.kind === 'carousel' ? <GalleryHorizontal {...I} /> : vert ? <Rows3 {...I} /> : <Columns3 {...I} />,
      name: b.kind === 'grid' ? 'Grid' : b.kind === 'carousel' ? 'Carousel' : `Auto layout · ${vert ? 'vertical' : 'horizontal'}`, kids: true, openKey: '__group' }));
  }
  if (!group || groupOpen) items.forEach((it, i) => {
    const els = itemEls(it);
    const d = group ? 1 : 0;
    rows.push(row({ k: 'i' + it.id, s: { block: b.id, item: i }, depth: 1 + d, icon: <Frame {...I} />, name: itemName(it, i), hidden: it.hidden, at: { i }, kids: els.length > 0, openKey: it.id, drop: 'item' }));
    if (open[it.id]) els.forEach((e) => rows.push(row({ k: 'e' + it.id + e.id, s: { block: b.id, item: i, el: `${it.id}.${e.id}` }, depth: 2 + d, icon: elIcon(e), name: elName(e), hidden: e.hidden, at: { i, el: e.id }, drop: 'el' })));
  });
  return <section className="ly" aria-label="Layers">
    <p className="ly-h">Layers</p>
    <div className="ly-list" role="tree" ref={list} onMouseLeave={() => hover(null)}>{rows}</div>
  </section>;
}

export const isChapterSel = (s: Sel | null) => s?.block === CHAPTER;
