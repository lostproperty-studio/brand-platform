'use client';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckSquare, ClipboardList, Compass, GripVertical, Heading1, Heading2, Lightbulb, List, Minus, PenLine, Plus, Quote, Text, Trash2, Copy as CopyIcon } from 'lucide-react';
import { isCheck, readFacts, type FactSheet } from '@/lib/factSheet';

// The Writer's page, built from blocks like a Notion page: text, headings, lists, to-dos, quotes, callouts and
// dividers, plus smart blocks. A Piece is copy written for places (Instagram, email…) with options from the Writer;
// a Brief tells the Writer what the doc's pieces need to do; a Fact comes live from the fact sheet. Words above a
// piece (back to the previous piece) brief it too. Type "/" in an empty line, or use the + in the margin, to add one.

export type BlockType = 'text' | 'h1' | 'h2' | 'todo' | 'bullet' | 'quote' | 'callout' | 'divider' | 'piece' | 'brief' | 'fact';
export type Brief = { goal?: string; audience?: string; say?: string; avoid?: string };
export type Block = { id: string; type: BlockType; text?: string; checked?: boolean; pieceId?: string; brief?: Brief; fact?: { tab: string; key: string } };

const uid = () => Math.random().toString(36).slice(2, 10);
const TEXTY: BlockType[] = ['text', 'h1', 'h2', 'todo', 'bullet', 'quote', 'callout'];

/** The doc's blocks; older docs (pieces only) get one block per piece, and a piece no block holds goes at the end */
export function blocksOf(blocks: Block[] | undefined, pieces: { id: string }[]): Block[] {
  const list = (blocks && blocks.length ? blocks : pieces.map((p) => ({ id: 'b-' + p.id, type: 'piece' as const, pieceId: p.id }))).filter((b) => b.type !== 'piece' || pieces.some((p) => p.id === b.pieceId));
  const held = new Set(list.map((b) => b.pieceId));
  return [...list, ...pieces.filter((p) => !held.has(p.id)).map((p) => ({ id: 'b-' + p.id, type: 'piece' as const, pieceId: p.id }))];
}

/** What briefs a piece: the doc's Brief blocks, and the words written above it since the last piece */
export function contextFor(blocks: Block[], pieceId: string, facts?: FactSheet | null) {
  const at = blocks.findIndex((b) => b.pieceId === pieceId);
  const above: string[] = [];
  for (let i = at - 1; i >= 0 && blocks[i].type !== 'piece'; i--) { const b = blocks[i]; if (TEXTY.includes(b.type) && b.text?.trim()) above.unshift(b.text.trim()); if (b.type === 'fact') { const f = factOf(facts, b); if (f) above.unshift(`Fact: ${f.label}: ${f.value}`); } }
  const briefs = blocks.filter((b) => b.type === 'brief' && b.brief).map((b) => briefText(b.brief!)).filter(Boolean);
  return [briefs.length ? `Brief: ${briefs.join(' ')}` : '', above.length ? `Notes for this piece: ${above.join(' / ')}` : ''].filter(Boolean).join('\n');
}
const briefText = (b: Brief) => [b.goal && `Goal: ${b.goal}.`, b.audience && `For: ${b.audience}.`, b.say && `Must say: ${b.say}.`, b.avoid && `Avoid: ${b.avoid}.`].filter(Boolean).join(' ');
function factOf(f: FactSheet | null | undefined, b: Block) {
  if (!f || !b.fact) return null;
  const t = f.tabs.find((x) => x.id === b.fact!.tab); const r = t?.rows.find((x) => x[0] === b.fact!.key);
  if (!t || !r) return null;
  const vals = r.slice(1).map((c, i) => [t.columns[i + 1], c.trim()] as const).filter(([k, c]) => c && !/^notes?$/i.test(k));
  return { label: r[0], value: vals.length === 1 ? vals[0][1] : vals.map(([k, c]) => `${k}: ${c}`).join(' · '), unsure: isCheck(r), where: t.title };
}

type Item = { type: BlockType; label: string; about: string; Ic: typeof Text; smart?: boolean; keys?: string };
const MENU: Item[] = [
  { type: 'piece', label: 'Piece', about: 'Copy for places, with options from the Writer', Ic: PenLine, smart: true },
  { type: 'brief', label: 'Brief', about: 'What the pieces need to do. The Writer reads it', Ic: Compass, smart: true },
  { type: 'fact', label: 'Fact', about: 'A confirmed fact, live from the fact sheet', Ic: ClipboardList, smart: true },
  { type: 'text', label: 'Text', about: 'Plain writing', Ic: Text },
  { type: 'h1', label: 'Heading', about: 'A section', Ic: Heading1, keys: '#' },
  { type: 'h2', label: 'Subheading', about: 'A smaller section', Ic: Heading2, keys: '##' },
  { type: 'todo', label: 'To-do', about: 'Something to tick off', Ic: CheckSquare, keys: '[]' },
  { type: 'bullet', label: 'List', about: 'A bulleted line', Ic: List, keys: '-' },
  { type: 'quote', label: 'Quote', about: 'Someone’s words', Ic: Quote, keys: '>' },
  { type: 'callout', label: 'Callout', about: 'A note that stands out', Ic: Lightbulb },
  { type: 'divider', label: 'Divider', about: 'A line across the page', Ic: Minus, keys: '---' }
];
const SHORT: [RegExp, BlockType][] = [[/^#\s$/, 'h1'], [/^##\s$/, 'h2'], [/^\[\]\s$/, 'todo'], [/^[-*]\s$/, 'bullet'], [/^>\s$/, 'quote'], [/^---$/, 'divider']];

export function BlockCanvas({ blocks, setBlocks, slug, facts, addPiece, removePiece, renderPiece, readOnly }: {
  blocks: Block[]; setBlocks: (fn: (b: Block[]) => Block[]) => void; slug: string; facts: boolean;
  addPiece: () => string; removePiece: (id: string) => void; renderPiece: (pieceId: string, n: number) => ReactNode; readOnly?: boolean;
}) {
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [focusId, setFocusId] = useState<{ id: string; end?: boolean } | null>(null);
  const [menu, setMenu] = useState<{ at: string; q: string; mode: 'slash' | 'plus' | 'turn' } | null>(null);
  const [hi, setHi] = useState(0);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const [sheet, setSheet] = useState<FactSheet | null>(null);
  const [factPick, setFactPick] = useState<string | null>(null);
  useEffect(() => { if (facts) fetch(`/api/p/${slug}/facts`).then((r) => (r.ok ? r.json() : null)).then((j) => j && setSheet(readFacts({ factSheet: j.facts }))).catch(() => {}); }, [slug, facts]);
  useEffect(() => { if (!focusId) return; const el = refs.current[focusId.id]; if (el) { el.focus(); const n = focusId.end === false ? 0 : el.value.length; el.setSelectionRange(n, n); } setFocusId(null); }, [focusId, blocks]);

  const patch = (id: string, x: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...x } : b)));
  const insertAfter = (id: string | null, b: Block) => setBlocks((bs) => { const i = id ? bs.findIndex((x) => x.id === id) : bs.length - 1; const n = [...bs]; n.splice(i + 1, 0, b); return n; });
  const remove = (id: string) => setBlocks((bs) => bs.filter((b) => b.id !== id));
  const make = (type: BlockType): Block => {
    if (type === 'piece') return { id: uid(), type, pieceId: addPiece() };
    if (type === 'brief') return { id: uid(), type, brief: {} };
    return { id: uid(), type, text: '' };
  };
  // Picking from the menu: an empty line becomes the block; otherwise it goes in below
  const choose = (type: BlockType) => {
    if (!menu) return;
    const at = blocks.find((b) => b.id === menu.at); setMenu(null);
    if (type === 'fact') { setFactPick(menu.at); return; }
    if (menu.mode === 'turn' && at && TEXTY.includes(type) && TEXTY.includes(at.type)) { patch(at.id, { type }); setFocusId({ id: at.id }); return; }
    const emptyLine = at && at.type === 'text' && !(at.text || '').replace(/^\//, '').trim();
    const b = make(type);
    if (emptyLine && at) setBlocks((bs) => bs.map((x) => (x.id === at.id ? { ...b, id: at.id } : x)));
    else insertAfter(at?.id || null, b);
    const id = emptyLine && at ? at.id : b.id;
    if (TEXTY.includes(type)) setFocusId({ id });
    else if (type === 'divider' || type === 'brief') { const t: Block = { id: uid(), type: 'text', text: '' }; setTimeout(() => { insertAfter(id, t); if (type === 'divider') setFocusId({ id: t.id }); }, 0); }
  };
  const placeFact = (tab: string, key: string) => {
    const at = blocks.find((b) => b.id === factPick); setFactPick(null);
    const b: Block = { id: uid(), type: 'fact', fact: { tab, key } };
    if (at && at.type === 'text' && !(at.text || '').replace(/^\//, '').trim()) setBlocks((bs) => bs.map((x) => (x.id === at.id ? { ...b, id: at.id } : x)));
    else insertAfter(at?.id || null, b);
  };
  const items = menu ? MENU.filter((m) => (menu.mode !== 'turn' || TEXTY.includes(m.type)) && (m.type !== 'fact' || facts) && (!menu.q || `${m.label} ${m.about}`.toLowerCase().includes(menu.q.toLowerCase()))) : [];
  useEffect(() => { setHi(0); }, [menu?.q, menu?.at]);

  const key = (b: Block, i: number) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (menu && menu.at === b.id && menu.mode === 'slash') {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(items.length - 1, h + 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (items[hi]) { patch(b.id, { text: '' }); choose(items[hi].type); } return; }
      if (e.key === 'Escape') { e.preventDefault(); setMenu(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Enter on an empty list line or to-do ends the list
      if (['todo', 'bullet'].includes(b.type) && !el.value.trim()) { patch(b.id, { type: 'text' }); return; }
      const before = el.value.slice(0, el.selectionStart), after = el.value.slice(el.selectionEnd);
      const type: BlockType = ['todo', 'bullet'].includes(b.type) ? b.type : 'text';
      const nb: Block = { id: uid(), type, text: after };
      patch(b.id, { text: before }); insertAfter(b.id, nb); setFocusId({ id: nb.id, end: false });
      return;
    }
    if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (b.type !== 'text') { e.preventDefault(); patch(b.id, { type: 'text' }); return; }
      const prev = [...blocks.slice(0, i)].reverse().find((x) => TEXTY.includes(x.type));
      if (prev && blocks[i - 1]?.id === prev.id) { e.preventDefault(); const len = (prev.text || '').length; patch(prev.id, { text: (prev.text || '') + el.value }); remove(b.id); setTimeout(() => { const p = refs.current[prev.id]; if (p) { p.focus(); p.setSelectionRange(len, len); } }, 0); }
      else if (!el.value && blocks.length > 1) { e.preventDefault(); remove(b.id); if (prev) setFocusId({ id: prev.id }); }
      return;
    }
    if (e.key === 'ArrowUp' && !el.value.slice(0, el.selectionStart).includes('\n')) { const p = [...blocks.slice(0, i)].reverse().find((x) => TEXTY.includes(x.type)); if (p) { e.preventDefault(); setFocusId({ id: p.id }); } }
    if (e.key === 'ArrowDown' && !el.value.slice(el.selectionEnd).includes('\n')) { const n = blocks.slice(i + 1).find((x) => TEXTY.includes(x.type)); if (n) { e.preventDefault(); setFocusId({ id: n.id, end: false }); } }
  };
  const type = (b: Block) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    // Markdown shortcuts, as in Notion: "# ", "## ", "[] ", "- ", "> ", "---"
    if (b.type === 'text') for (const [re, t] of SHORT) if (re.test(v)) { if (t === 'divider') { patch(b.id, { type: 'divider', text: '' }); const nb: Block = { id: uid(), type: 'text', text: '' }; insertAfter(b.id, nb); setFocusId({ id: nb.id }); } else patch(b.id, { type: t, text: '' }); return; }
    patch(b.id, { text: v });
    if (b.type === 'text' && v.startsWith('/') && !v.includes(' ', 1) && v.length < 24) setMenu({ at: b.id, q: v.slice(1), mode: 'slash' });
    else if (menu?.at === b.id && menu.mode === 'slash') setMenu(null);
  };
  const grow = (el: HTMLTextAreaElement | null) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } };

  let pieceN = 0;
  return <div className="wb" onDragOver={(e) => drag && e.preventDefault()}>
    {blocks.map((b, i) => {
      if (b.type === 'piece') pieceN++;
      const n = pieceN;
      const dnd = drag ? {
        onDragOver: (e: React.DragEvent) => { e.preventDefault(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setOver({ id: b.id, after: e.clientY > r.top + r.height / 2 }); },
        onDrop: (e: React.DragEvent) => { e.preventDefault(); if (drag && over && drag !== over.id) setBlocks((bs) => { const m = bs.find((x) => x.id === drag)!; const rest = bs.filter((x) => x.id !== drag); const j = rest.findIndex((x) => x.id === over.id) + (over.after ? 1 : 0); rest.splice(j, 0, m); return rest; }); setDrag(null); setOver(null); }
      } : {};
      const numbered = b.type === 'bullet';
      return <Fragment key={b.id}>
        <div className={`wb-b wb-is-${b.type}` + (over?.id === b.id ? (over.after ? ' drop-after' : ' drop-before') : '') + (drag === b.id ? ' dragging' : '')} data-block={b.id} {...dnd}>
          {!readOnly ? <div className="wb-gut" contentEditable={false}>
            <button type="button" className="wb-g" onClick={() => setMenu(menu?.at === b.id && menu.mode === 'plus' ? null : { at: b.id, q: '', mode: 'plus' })} aria-label="Add a block below" title="Add a block below"><Plus size={16} strokeWidth={1.6} aria-hidden /></button>
            <button type="button" className="wb-g wb-drag" draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.id); setDrag(b.id); }} onDragEnd={() => { setDrag(null); setOver(null); }}
              onClick={() => setMenu(menu?.at === b.id && menu.mode === 'turn' ? null : { at: b.id, q: '', mode: 'turn' })} aria-label="Drag to move, or click for options" title="Drag to move · click for options"><GripVertical size={16} strokeWidth={1.6} aria-hidden /></button>
          </div> : null}
          {TEXTY.includes(b.type) ? <div className="wb-line">
            {b.type === 'todo' ? <input type="checkbox" className="wb-check" checked={!!b.checked} onChange={(e) => patch(b.id, { checked: e.target.checked })} aria-label="Done" disabled={readOnly} /> : null}
            {numbered ? <span className="wb-dot" aria-hidden /> : null}
            {b.type === 'callout' ? <Lightbulb size={18} strokeWidth={1.6} className="wb-ci" aria-hidden /> : null}
            <textarea ref={(el) => { refs.current[b.id] = el; grow(el); }} rows={1} className={'wb-t' + (b.type === 'todo' && b.checked ? ' done' : '')} value={b.text || ''} readOnly={readOnly}
              placeholder={b.type === 'text' ? (blocks.length === 1 || i === blocks.length - 1 ? 'Write, or type / for blocks' : '') : b.type === 'h1' ? 'Heading' : b.type === 'h2' ? 'Subheading' : b.type === 'todo' ? 'To-do' : b.type === 'bullet' ? 'List' : b.type === 'quote' ? 'Quote' : 'Callout'}
              onChange={type(b)} onKeyDown={key(b, i)} onInput={(e) => grow(e.currentTarget)} aria-label={MENU.find((m) => m.type === b.type)?.label} />
          </div> : null}
          {b.type === 'divider' ? <hr className="wb-hr" /> : null}
          {b.type === 'piece' && b.pieceId ? renderPiece(b.pieceId, n) : null}
          {b.type === 'brief' ? <BriefBlock b={b.brief || {}} set={(x) => patch(b.id, { brief: { ...(b.brief || {}), ...x } })} readOnly={readOnly} /> : null}
          {b.type === 'fact' ? (() => { const f = factOf(sheet, b); return <div className={'wb-fact' + (f?.unsure ? ' unsure' : '')}>
            <ClipboardList size={16} strokeWidth={1.6} aria-hidden />
            {f ? <><span className="wb-fact-k">{f.label}</span><span className="wb-fact-v">{f.value || '–'}</span><span className="wb-fact-w">{f.unsure ? 'Not confirmed yet' : f.where}</span></>
              : <span className="mute">{sheet ? 'This fact isn’t on the fact sheet any more.' : 'Loading the fact…'}</span>}
          </div>; })() : null}
          {menu?.at === b.id ? <Menu items={items} hi={hi} setHi={setHi} title={menu.mode === 'turn' ? 'Turn into' : menu.q ? undefined : 'Add a block'} onPick={(t) => { if (menu.mode === 'slash') patch(b.id, { text: '' }); choose(t); }} onClose={() => setMenu(null)}
            extra={menu.mode === 'turn' ? <>
              <button type="button" onClick={() => { setMenu(null); const c = { ...b, id: uid() }; insertAfter(b.id, b.type === 'piece' ? { ...c, type: 'text', text: '' } : c); }}><CopyIcon size={15} strokeWidth={1.6} aria-hidden /><span><b>Duplicate</b></span></button>
              <button type="button" className="danger" onClick={() => { setMenu(null); if (b.type === 'piece') { if (!confirm('Delete this piece?')) return; removePiece(b.pieceId!); } remove(b.id); }}><Trash2 size={15} strokeWidth={1.6} aria-hidden /><span><b>Delete</b></span></button>
            </> : null} /> : null}
          {factPick === b.id ? <FactPicker sheet={sheet} onPick={placeFact} onClose={() => setFactPick(null)} /> : null}
        </div>
      </Fragment>;
    })}
    {!readOnly ? <button type="button" className="wb-end" onClick={() => { const last = blocks[blocks.length - 1]; if (last?.type === 'text' && !last.text) { setFocusId({ id: last.id }); return; } const nb: Block = { id: uid(), type: 'text', text: '' }; insertAfter(null, nb); setFocusId({ id: nb.id }); }} aria-label="Add a line at the end" /> : null}
  </div>;
}

function Menu({ items, hi, setHi, title, onPick, onClose, extra }: { items: Item[]; hi: number; setHi: (n: number) => void; title?: string; onPick: (t: BlockType) => void; onClose: () => void; extra?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest?.('.wb-gut')) onClose(); }; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('mousedown', c); addEventListener('keydown', k); return () => { removeEventListener('mousedown', c); removeEventListener('keydown', k); }; }, [onClose]);
  useEffect(() => { ref.current?.querySelector('.hi')?.scrollIntoView({ block: 'nearest' }); }, [hi]);
  const smart = items.filter((x) => x.smart), basic = items.filter((x) => !x.smart);
  const row = (x: Item) => { const k = items.indexOf(x); return <button type="button" key={x.type} className={k === hi ? 'hi' : ''} onMouseEnter={() => setHi(k)} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(x.type)}>
    <span className={'wb-mi' + (x.smart ? ' smart' : '')}><x.Ic size={17} strokeWidth={1.6} aria-hidden /></span><span><b>{x.label}</b><span>{x.about}</span></span>{x.keys ? <kbd>{x.keys}</kbd> : null}</button>; };
  return <div className="wb-menu" ref={ref} role="menu">
    {title ? <p className="wb-mh">{title}</p> : null}
    {!items.length ? <p className="wb-none">No blocks match</p> : null}
    {smart.length ? <><p className="wb-mh">Smart</p>{smart.map(row)}</> : null}
    {basic.length ? <><p className="wb-mh">{smart.length ? 'Basic' : title === 'Turn into' ? '' : 'Basic'}</p>{basic.map(row)}</> : null}
    {extra ? <><hr />{extra}</> : null}
  </div>;
}

function BriefBlock({ b, set, readOnly }: { b: Brief; set: (x: Partial<Brief>) => void; readOnly?: boolean }) {
  const F: [keyof Brief, string, string][] = [['goal', 'Goal', 'What should this doc’s writing do?'], ['audience', 'For', 'Who’s reading?'], ['say', 'Must say', 'The facts and messages that have to be there'], ['avoid', 'Avoid', 'Words, claims or tones to stay away from']];
  return <div className="wb-brief">
    <p className="wb-brief-h"><Compass size={15} strokeWidth={1.7} aria-hidden />Brief<span>The Writer reads this for every piece</span></p>
    {F.map(([k, l, ph]) => <label key={k} className="wb-brief-r"><span>{l}</span><textarea rows={1} value={b[k] || ''} placeholder={ph} readOnly={readOnly} onChange={(e) => set({ [k]: e.target.value })} ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} onInput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }} /></label>)}
  </div>;
}

function FactPicker({ sheet, onPick, onClose }: { sheet: FactSheet | null; onPick: (tab: string, key: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }; addEventListener('mousedown', c); return () => removeEventListener('mousedown', c); }, [onClose]);
  const rows = useMemo(() => (sheet?.tabs || []).flatMap((t) => t.rows.filter((r) => r[0]?.trim() && r.slice(1).some((c) => c.trim())).map((r) => ({ t, r }))).filter(({ r }) => !q || r.join(' ').toLowerCase().includes(q.toLowerCase())).slice(0, 60), [sheet, q]);
  return <div className="wb-menu wb-facts" ref={ref} role="dialog" aria-label="Add a fact">
    <input autoFocus className="wb-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a fact: hours, prices, people…" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && rows[0]) onPick(rows[0].t.id, rows[0].r[0]); }} />
    {!sheet ? <p className="wb-none">Loading the fact sheet…</p> : !rows.length ? <p className="wb-none">Nothing matches. Add it to the fact sheet first.</p> : null}
    {rows.map(({ t, r }) => <button type="button" key={t.id + r[0]} onClick={() => onPick(t.id, r[0])}><span className="wb-mi"><ClipboardList size={15} strokeWidth={1.6} aria-hidden /></span><span><b>{r[0]}</b><span>{isCheck(r) ? 'Not confirmed yet · ' : ''}{r.slice(1).filter((c) => c.trim() && !/check:/i.test(c)).join(' · ').slice(0, 90)}</span></span><kbd>{t.title}</kbd></button>)}
  </div>;
}

