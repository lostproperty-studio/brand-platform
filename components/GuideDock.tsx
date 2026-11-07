'use client';
import { useEffect, useState } from 'react';
import type { Block, BlockKind, GuideChapter } from '@/lib/portal/guide';
import { KINDS, KindIcon, convert } from '@/components/GuideEditor';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Eye, EyeOff, Keyboard, Palette, Redo2, RotateCcw, Trash2, Undo2, X, type LucideIcon } from 'lucide-react';

/** What's selected in the editor: a section, and optionally a piece of text, an item or an image inside it. */
export type Sel = { block: string; el?: string; item?: number; /** The space before a part of the section */ gap?: string };
/** The chapter's own label, title and introduction are selected as this block id */
export const CHAPTER = '__chapter';
/** Typefaces with files uploaded to the project, and the weights uploaded for each */
export type ToolbarFont = { role: string; label: string; name: string; weights: number[] };
const CH_FIELD: Record<string, string> = { kicker: 'Label', title: 'Title', lede: 'Introduction' }; // on the home page, lede is the welcome

const FIELD: Record<string, string> = { eyebrow: 'Label', heading: 'Headline', body: 'Text', label: 'Label' };
/** Figma's names for what's selected */
const NAME = (k: string) => (k === 'columns' ? 'Auto layout' : KINDS.find(([x]) => x === k)?.[1] || 'Section');
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

// The top bar: history, where you are, and what you can do to the section as a whole (its type, order, copy, visibility,
// deletion). Everything visual (type, colour, spacing, frames) is in the panel on the right, as in Figma.
export function Toolbar({ sel, setSel, ch, setBlocks, editBlock, onReset, onDelete, undo, redo, canUndo, canRedo, onStyles, onKeys, onLayout }: {
  sel: Sel | null; setSel: (s: Sel | null) => void; ch: GuideChapter;
  setBlocks: (b: Block[]) => void; editBlock: (id: string, p: Partial<Block>, key?: string) => void;
  onReset: (b: Block) => void; onDelete: (b: Block) => void; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
  onStyles: () => void; onKeys: () => void; onLayout?: (b: Block) => void;
}) {
  const [pop, setPop] = useState<string | null>(null);
  useEffect(() => { if (!pop) return; const off = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.tb-pop-wrap')) setPop(null); }; const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPop(null); document.addEventListener('mousedown', off); document.addEventListener('keydown', esc); return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); }; }, [pop]);
  useEffect(() => setPop(null), [sel?.block, sel?.el]);
  const b = sel ? ch.blocks.find((x) => x.id === sel.block) : undefined;
  const history = <div className="tb-grp"><Btn icon={Undo2} tip="Undo ⌘Z" onClick={undo} disabled={!canUndo} /><Btn icon={Redo2} tip="Redo ⇧⌘Z" onClick={redo} disabled={!canRedo} /></div>;
  const keep = (e: React.MouseEvent) => { if (!(e.target as HTMLElement).closest('input')) e.preventDefault(); };
  const tools = <div className="tb-grp"><Btn icon={Palette} tip="Text styles and spacing" onClick={onStyles}>Styles</Btn><Btn icon={Keyboard} tip="Keyboard shortcuts ⇧?" onClick={onKeys} /></div>;

  if (sel?.block === CHAPTER && sel.el) return <div className="tb" role="toolbar" aria-label="Editing tools" onMouseDown={keep}>{history}
    <span className="tb-ctx"><span className="tb-crumb">{ch.id === '__home' ? 'Home page' : 'Chapter heading'}</span><ChevronRight size={14} strokeWidth={1.75} aria-hidden /><span className="tb-crumb on">{CH_FIELD[sel.el] || 'Text'}</span></span>
    <div className="tb-grp tb-end">{tools}<span className="tb-sep" /><Btn icon={X} tip="Deselect Esc" onClick={() => setSel(null)} /></div>
  </div>;

  if (!b || !sel) return <div className="tb" role="toolbar" aria-label="Editing tools" onMouseDown={keep}>{history}<span className="tb-ctx tb-empty">Select a section, frame, text or image</span><div className="tb-grp tb-end">{tools}</div></div>;

  const i = sel.item;
  const items = b.items || [];
  const elKind = i !== undefined && sel.el?.includes('.') ? items[i]?.els?.find((e) => e.id === sel.el!.split('.')[1])?.kind : undefined;
  const isImg = !!sel.el && (sel.el.startsWith('img:') || sel.el.startsWith('itemimg:') || elKind === 'image');
  const field = sel.el && !isImg ? (sel.el.includes('.') ? sel.el.split('.')[1] : sel.el) : '';
  const idx = ch.blocks.indexOf(b);
  const move = (d: number) => { const l = [...ch.blocks]; const [x] = l.splice(idx, 1); l.splice(Math.max(0, Math.min(l.length, idx + d)), 0, x); setBlocks(l); };
  const dup = () => { const l = [...ch.blocks]; const copy = { ...b, id: 'b-' + Math.random().toString(36).slice(2, 10), source: undefined, edited: true }; l.splice(idx + 1, 0, copy); setBlocks(l); setSel({ block: copy.id }); };
  const kindLabel = NAME(b.kind);
  const inner = !!sel.el || i !== undefined || !!sel.gap;
  const ctx = sel.gap ? 'Spacing' : elKind === 'spacer' ? 'Spacer' : elKind === 'frame' ? 'Frame' : elKind === 'icon' ? 'Icon' : isImg ? 'Image' : sel.el ? (FIELD[field] || (sel.el.startsWith('x-') ? 'Text' : 'Text')) : `Frame ${i! + 1}`;

  return (
    <div className="tb" role="toolbar" aria-label="Editing tools" onMouseDown={keep}>
      {history}
      <span className="tb-ctx">
        <Pop pop={pop} setPop={setPop} id="layout" tip="Section type" icon={<KindIcon k={b.kind} />} label={kindLabel}>
          {onLayout ? <button type="button" className="tb-menu-item" onClick={() => { setPop(null); onLayout(b); }}>Choose a layout…</button> : null}
          {KINDS.map(([k, l]) => <button type="button" key={k} role="menuitemradio" aria-checked={b.kind === k} className={'tb-menu-item' + (b.kind === k ? ' on' : '')} onClick={() => { editBlock(b.id, convert(b, k as BlockKind)); setPop(null); }}><KindIcon k={k} />{k === 'columns' ? 'Auto layout' : l}</button>)}
        </Pop>
        {inner ? <><ChevronRight size={14} strokeWidth={1.75} aria-hidden />{sel.el && i !== undefined ? <><button type="button" className="tb-crumb" onClick={() => setSel({ block: b.id, item: i })} data-tip="Select the frame ⇧Enter">Frame {i + 1}</button><ChevronRight size={14} strokeWidth={1.75} aria-hidden /></> : null}<span className="tb-crumb on">{ctx}</span></> : null}
      </span>
      <div className="tb-grp tb-end" aria-label="Section">
        {tools}
        <span className="tb-sep" />
        <Btn icon={ArrowUp} tip="Move section up ⌥⌘↑" disabled={idx === 0} onClick={() => move(-1)} />
        <Btn icon={ArrowDown} tip="Move section down ⌥⌘↓" disabled={idx === ch.blocks.length - 1} onClick={() => move(1)} />
        <Btn icon={Copy} tip="Duplicate section ⌘D" onClick={dup} />
        {b.source && b.edited ? <Btn icon={RotateCcw} tip="Reset to the Figma version" onClick={() => onReset(b)} /> : null}
        <Btn icon={b.hidden ? EyeOff : Eye} tip={b.hidden ? 'Hidden from the client. Show ⇧⌘H' : 'Hide from the client ⇧⌘H'} on={b.hidden} onClick={() => editBlock(b.id, { hidden: !b.hidden })} />
        <Btn icon={Trash2} tip="Delete section" danger onClick={() => onDelete(b)} />
        <span className="tb-sep" />
        <Btn icon={X} tip="Deselect Esc" onClick={() => setSel(null)} />
      </div>
    </div>
  );
}

/** Figma's shortcuts, as they work here */
export const SHORTCUTS: [string, string][] = [
  ['V', 'Select (put a tool down)'], ['T', 'Text tool'], ['F', 'Frame tool'], ['⇧⌘K', 'Place image'],
  ['⌘D', 'Duplicate'], ['⌫', 'Delete'], ['⇧⌘H', 'Show or hide the section'], ['⌘[  ⌘]', 'Move earlier or later'], ['⌥⌘↑  ⌥⌘↓', 'Move the section up or down'],
  ['Enter', 'Select inside'], ['⇧Enter', 'Select the parent'], ['Esc', 'Select the parent, then deselect'],
  ['⌥⌘T', 'Text styles and spacing'], ['⌘Z  ⇧⌘Z', 'Undo, redo'], ['⇧?', 'These shortcuts']
];
export function Shortcuts({ onClose }: { onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <div className="cf-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="cf ks" role="dialog" aria-label="Keyboard shortcuts">
    <h2 className="cf-t">Keyboard shortcuts</h2><p className="cf-b">The same as Figma.</p>
    <dl className="ks-l">{SHORTCUTS.map(([k, l]) => <div key={l}><dt>{l}</dt><dd>{k.split('  ').map((x) => <kbd key={x}>{x}</kbd>)}</dd></div>)}</dl>
    <div className="cf-row"><button className="btn" onClick={onClose}>Close</button></div>
  </div></div>;
}
