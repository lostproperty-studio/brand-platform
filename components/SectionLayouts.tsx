'use client';
import { useEffect, useState } from 'react';
import type { Block, BlockItem, BlockKind, SectionLayout } from '@/lib/figma/blocks';
import { KINDS, KindIcon } from '@/components/GuideEditor';

// Section layouts, like choosing a slide layout: every section has a headline and a short introduction, then one
// of these. In the editor each section is a slide with clear edges; the client sees one continuous page.

const iid = () => 'i' + Math.random().toString(36).slice(2, 8);
const card = (n: number): BlockItem => ({ id: iid(), label: String(n).padStart(2, '0'), heading: 'A headline', body: 'A sentence or two to go with it.' });
/** Columns hold lighter content: a label and a line */
const col = (n: number): BlockItem => ({ id: iid(), label: String(n).padStart(2, '0'), body: 'A sentence or two about this point.' });

export type LayoutDef = { id: SectionLayout; label: string; help: string; make: () => Partial<Block>; art: React.ReactNode };

// Wireframes, drawn on a 120×72 slide: headline and introduction bars at the top, then the layout
const T = <><rect x="10" y="9" width="46" height="5" rx="1" className="lw-ink" /><rect x="10" y="17" width="70" height="3" rx="1" className="lw-mute" /></>;
const cols = (n: number) => Array.from({ length: n }, (_, i) => { const w = (100 - (n - 1) * 4) / n, x = 10 + i * (w + 4); return <g key={i}><rect x={x} y="28" width={w} height="22" rx="2" className="lw-box" /><rect x={x} y="54" width={w * 0.8} height="3" rx="1" className="lw-ink" /><rect x={x} y="60" width={w * 0.6} height="2.5" rx="1" className="lw-mute" /></g>; });

export const LAYOUTS: LayoutDef[] = [
  { id: 'statement', label: 'Statement', help: 'A large headline and a line under it, on colour or an image. Runs edge to edge.', make: () => ({ kind: 'statement', heading: 'A large statement', body: 'A line to go under it.', ratio: '16:9', full: true }), art: <><rect x="0" y="0" width="120" height="72" className="lw-panel" /><rect x="12" y="24" width="80" height="9" rx="1.5" className="lw-inv" /><rect x="12" y="37" width="56" height="9" rx="1.5" className="lw-inv" /><rect x="12" y="52" width="44" height="3" rx="1" className="lw-inv2" /></> },
  { id: 'cols2', label: '2 columns', help: 'Auto layout, two frames side by side: a pair, or a do and a don’t.', make: () => ({ kind: 'columns', cols: 2, flow: { dir: 'row' }, box: 'none', items: [1, 2].map(col) }), art: <>{T}{cols(2)}</> },
  { id: 'cols3', label: '3 columns', help: 'Three points, examples or modes.', make: () => ({ kind: 'columns', cols: 3, flow: { dir: 'row' }, box: 'none', items: [1, 2, 3].map(col) }), art: <>{T}{cols(3)}</> },
  { id: 'cols4', label: '4 columns', help: 'Four smaller items: values, icons, sizes.', make: () => ({ kind: 'columns', cols: 4, flow: { dir: 'row' }, box: 'none', items: [1, 2, 3, 4].map(col) }), art: <>{T}{cols(4)}</> },
  { id: 'carousel', label: 'Carousel', help: 'Cards that scroll sideways: steps, examples, applications.', make: () => ({ kind: 'carousel', variant: 'cards', box: 'fill', items: [1, 2, 3].map(card) }), art: <>{T}<rect x="10" y="28" width="40" height="36" rx="2" className="lw-box" /><rect x="54" y="28" width="40" height="36" rx="2" className="lw-box" /><rect x="98" y="28" width="22" height="36" rx="2" className="lw-box lw-fade" /></> },
  { id: 'bento', label: 'Bento grid', help: 'One large frame with smaller ones around it.', make: () => ({ kind: 'grid', gridCols: 6, rowH: 'm', box: 'fill', items: ([[3, 4], [3, 2], [3, 2]] as [number, number][]).map(([w, h], i) => ({ ...card(i + 1), w, h })) }), art: <>{T}<rect x="10" y="28" width="58" height="36" rx="2" className="lw-box" /><rect x="72" y="28" width="38" height="16" rx="2" className="lw-box" /><rect x="72" y="48" width="38" height="16" rx="2" className="lw-box" /></> },
  { id: 'image', label: 'Large image', help: 'One image, full width.', make: () => ({ kind: 'image', media: [] }), art: <>{T}<rect x="10" y="28" width="100" height="36" rx="2" className="lw-img" /><path d="M14 60 l14 -14 l10 10 l8 -6 l14 10z" className="lw-mute" /></> },
  { id: 'split', label: 'Text and image', help: 'Text on the left, an image on the right.', make: () => ({ kind: 'split', side: 'right', media: [] }), art: <><rect x="10" y="16" width="42" height="5" rx="1" className="lw-ink" /><rect x="10" y="25" width="46" height="3" rx="1" className="lw-mute" /><rect x="10" y="31" width="40" height="3" rx="1" className="lw-mute" /><rect x="10" y="37" width="44" height="3" rx="1" className="lw-mute" /><rect x="64" y="10" width="46" height="52" rx="2" className="lw-img" /></> }
];

/** The layout a section has, from what it's made of */
export function layoutOf(b: Block): SectionLayout | null {
  if (b.kind === 'columns') return (`cols${Math.min(4, Math.max(2, (b.items || []).length || b.cols || 3))}`) as SectionLayout;
  if (b.kind === 'carousel') return 'carousel';
  if (b.kind === 'grid') return 'bento';
  if (b.kind === 'image') return 'image';
  if (b.kind === 'split') return 'split';
  if (b.kind === 'statement') return 'statement';
  return b.layout || null;
}
export const layoutLabel = (b: Block) => { const l = layoutOf(b); return l ? LAYOUTS.find((x) => x.id === l)!.label : KINDS.find(([k]) => k === b.kind)?.[1] || 'Section'; };

/** A new section in a layout: a headline and an introduction, then the layout's content */
export function newSection(layout: SectionLayout): Partial<Block> {
  const d = LAYOUTS.find((x) => x.id === layout)!;
  return { layout, heading: 'Section headline', body: 'A short introduction to this section.', ...d.make() };
}

/** Changes a section's layout and keeps its content: boxes stay boxes, images stay images */
export function convertSection(b: Block, to: SectionLayout): Partial<Block> {
  const items = b.items || [];
  const media = b.media || [];
  const fill = (n: number) => (items.length >= n ? items : [...items, ...Array.from({ length: n - items.length }, (_, i) => card(items.length + i + 1))]);
  switch (to) {
    case 'cols2': case 'cols3': case 'cols4': { const n = Number(to.slice(4)); return { layout: to, kind: 'columns', cols: n, flow: { ...(b.flow || {}), dir: b.flow?.dir || 'row', wrap: undefined }, items: fill(n).map((it) => ({ ...it, w: 1 })), variant: undefined }; }
    case 'carousel': return { layout: to, kind: 'carousel', variant: items.length || !media.length ? 'cards' : 'images', box: b.box && b.box !== 'none' ? b.box : 'fill', items: fill(3) };
    case 'bento': { const sizes: [number, number][] = [[3, 4], [3, 2], [3, 2], [2, 2], [2, 2], [2, 2]]; return { layout: to, kind: 'grid', gridCols: 6, rowH: b.rowH || 'm', box: b.box && b.box !== 'none' ? b.box : 'fill', items: fill(3).map((it, i) => ({ ...it, w: (sizes[i] || [2, 2])[0], h: (sizes[i] || [2, 2])[1] })) }; }
    case 'image': return { layout: to, kind: 'image', media: media.slice(0, 1).length ? media : (items.flatMap((it) => (it.media ? [it.media] : [])).slice(0, 1) as Block['media']) };
    case 'statement': return { layout: to, kind: 'statement', ratio: b.ratio || '16:9', full: b.full ?? true, heading: b.heading || items[0]?.heading || 'A large statement' };
    case 'split': return { layout: to, kind: 'split', side: 'right', media: media.slice(0, 1).length ? media.slice(0, 1) : (items.flatMap((it) => (it.media ? [it.media] : [])).slice(0, 1) as Block['media']), body: b.body || items.map((it) => [it.heading, it.body].filter(Boolean).join(': ')).filter(Boolean).join('\n\n') };
  }
}

const OTHER: BlockKind[] = ['text', 'divider', 'swatches', 'media', 'spacer'];

/** The layout picker: the seven section layouts as slide thumbnails, and the other kinds of section below */
export function LayoutPicker({ title = 'Add a section', current, onPick, onPickKind, onClose }: { title?: string; current?: SectionLayout | null; onPick: (l: SectionLayout) => void; onPickKind?: (k: BlockKind) => void; onClose: () => void }) {
  const [focus, setFocus] = useState(0);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }, [onClose]);
  return <div className="cf-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="cf lp-pick" role="dialog" aria-modal="true" aria-labelledby="lp-t">
      <h2 id="lp-t" className="cf-t">{title}</h2>
      <p className="cf-b">Every section starts with a headline and an introduction. Pick what comes after.</p>
      <div className="lp-grid" role="listbox" aria-label="Layouts">
        {LAYOUTS.map((l, i) => <button key={l.id} role="option" aria-selected={current === l.id} autoFocus={i === 0} className={'lp-opt' + (current === l.id ? ' on' : '')} onClick={() => onPick(l.id)} onFocus={() => setFocus(i)}>
          <svg viewBox="0 0 120 72" aria-hidden>{l.art}</svg>
          <b>{l.label}</b><span>{l.help}</span>
        </button>)}
      </div>
      {onPickKind ? <><p className="lp-h">Other sections</p><div className="lp-other">{OTHER.map((k) => <button key={k} className="lp-kind" onClick={() => onPickKind(k)}><KindIcon k={k} />{KINDS.find(([x]) => x === k)?.[1]}</button>)}</div></> : null}
      <span className="sr" aria-live="polite">{LAYOUTS[focus]?.label}</span>
      <div className="cf-row"><button className="btn" onClick={onClose}>Cancel</button></div>
    </div>
  </div>;
}
