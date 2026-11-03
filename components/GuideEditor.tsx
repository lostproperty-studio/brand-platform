'use client';
import { createElement, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Block, BlockKind, BlockMedia, Guide, GuideChapter } from '@/lib/portal/guide';
import { blockText, itemEls, itemWords, type BlockItem, type BoxStyle, type ItemEl, type TextStyle } from '@/lib/figma/blocks';
import { GuideBlock, textOn, type EditKit, type TextField } from '@/components/portal/GuideBlock';
import { Inspector } from '@/components/GuideInspector';
import { AddBar, addTarget, type AddWhat } from '@/components/GuideAddBar';
import { CHAPTER, Toolbar, type Sel, type ToolbarFont } from '@/components/GuideDock';
import { textProps } from '@/lib/textStyle';
import { fontFaceCss, type ProjectFont } from '@/lib/fonts';
import { House, AlignLeft, Columns3, ExternalLink, Eye, EyeOff, GripVertical, Heading, GalleryHorizontal, UnfoldVertical, Image as ImageIcon, Images, LayoutGrid, PanelLeft, PanelTop, Palette, Plus, Quote, RefreshCw, FilePlus2, TriangleAlert, ScanSearch, Trash2, Upload, type LucideIcon } from 'lucide-react';
import { TimedProgress } from '@/components/Progress';
import { tierLabel, type Tier } from '@/lib/playbook';
import { ChapterCover } from '@/components/portal/ChapterCover';
import { coverKind } from '@/lib/portal/covers';

export const KINDS: [BlockKind, string][] = [['divider', 'Subsection headline'], ['text', 'Text'], ['columns', 'Columns'], ['grid', 'Grid'], ['statement', 'Statement'], ['split', 'Text + image'], ['image', 'Full-width image'], ['media', 'Images'], ['carousel', 'Carousel'], ['swatches', 'Colour swatches'], ['spacer', 'Spacer']];
export const BOXES: [BoxStyle, string][] = [['none', 'None'], ['corners', 'Corner marks'], ['outline', 'Outline'], ['fill', 'Fill']];
const iid = () => 'i-' + Math.random().toString(36).slice(2, 9);

/** Switching layout keeps the words: text splits into items, items join back into text. */
export function convert(b: Block, kind: BlockKind): Partial<Block> {
  const toItems = (): BlockItem[] => { const paras = (b.body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean); return (paras.length ? paras : ['']).slice(0, 8).map((p) => ({ id: iid(), body: p || undefined, w: 3, h: 2 })); };
  if (kind === 'carousel') {
    // Images when the section is mostly pictures, otherwise cards of text
    if ((b.media || []).length && !(b.items || []).length) return { kind, variant: 'images' };
    return { kind, variant: 'cards', items: (b.items || []).length ? b.items : toItems().map((i) => ({ ...i, heading: i.body, body: undefined })), body: (b.items || []).length ? b.body : undefined, box: b.box && b.box !== 'none' ? b.box : 'fill' };
  }
  if ((kind === 'columns' || kind === 'grid') && !(b.items || []).length) return { kind, items: toItems(), body: undefined, cols: kind === 'columns' ? 3 : undefined, box: b.box || 'none' };
  if (kind === 'columns' || kind === 'grid') return { kind, cols: kind === 'columns' ? Math.max(2, Math.min(4, b.cols || (b.items || []).length)) : undefined, items: (b.items || []).map((i) => ({ ...i, w: i.w || 3, h: i.h || 2 })) };
  if ((b.kind === 'columns' || b.kind === 'grid') && b.items?.length) return { kind, items: undefined, body: [b.body, ...b.items.map((i) => itemWords(i).join('\n'))].filter(Boolean).join('\n\n'), media: [...(b.media || []), ...b.items.flatMap((i) => itemEls(i).map((e) => e.media)).filter(Boolean) as BlockMedia[]] };
  return { kind, side: kind === 'split' ? b.side || 'right' : b.side };
}
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHtml = (v: string | undefined, multiline: boolean) => (!v ? '' : multiline ? v.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') : esc(v).replace(/\n/g, '<br>'));
// innerText follows CSS case changes, so read it with them switched off; otherwise UPPERCASE styling would be saved into the words
const fromEl = (el: HTMLElement) => { el.classList.add('ed-raw'); const t = el.innerText; el.classList.remove('ed-raw'); return tidy(t); };
const tidy = (t: string) => t.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();

// Text you edit in place, in the brand's own type. Enter ends a headline; in body text, Enter starts a new paragraph.
function Editable({ value, onSave, tag, className, placeholder, multiline, style, onFocus, on }: { value?: string; onSave: (v: string) => void; tag: string; className: string; placeholder: string; multiline?: boolean; style?: React.CSSProperties; onFocus?: () => void; on?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { const el = ref.current; if (el && document.activeElement !== el) el.innerHTML = toHtml(value, !!multiline); }, [value, multiline]);
  return createElement(tag, {
    ref, className: className + ' ed' + (on ? ' ed-on' : ''), style, onFocus, contentEditable: true, suppressContentEditableWarning: true, 'data-ph': placeholder, spellCheck: true, role: 'textbox', 'aria-label': placeholder, 'aria-multiline': multiline || undefined,
    onBlur: () => { const el = ref.current; if (!el) return; const v = fromEl(el); if (v !== (value || '').trim()) onSave(v); if (!v) el.innerHTML = ''; },
    onPaste: (e: React.ClipboardEvent) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') { (e.target as HTMLElement).innerHTML = toHtml(value, !!multiline); (e.target as HTMLElement).blur(); }
      if (e.key === 'Enter' && !multiline && !e.shiftKey) { e.preventDefault(); (e.target as HTMLElement).blur(); }
    }
  });
}

// The studio's guidelines editor: the client's view, editable in place.
const toolbarFonts = (fs: ProjectFont[]): ToolbarFont[] => fs.filter((f) => f.files.length).map((f) => ({ role: f.role, label: f.label, name: f.name, weights: [...new Set(f.files.map((x) => x.weight))].sort((a, b) => a - b) }));

export function GuideEditor({ projectId, slug, guide: initial, content, thumbs, fontCss, fonts: initialFonts = [], tier, colours = [], logoUrl = null, home }: { home?: HomeData; projectId: string; slug: string; guide: Guide | null; content: Record<string, unknown>; thumbs: Record<string, string>; fontCss: string; fonts?: ProjectFont[]; tier?: Tier; colours?: { name: string; hex: string }[]; logoUrl?: string | null }) {
  // Typefaces: only those uploaded to the project. A new one uploaded from the toolbar is loaded straight away.
  const [fonts, setFonts] = useState(initialFonts);
  const [liveFontCss, setLiveFontCss] = useState('');
  const [fontAsk, setFontAsk] = useState<((role: string) => void) | null>(null);
  const router = useRouter();
  const [guide, setGuide] = useState(initial);
  const [urls, setUrls] = useState(thumbs);
  const [chId, setChId] = useState(initial?.chapters[0]?.id || '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [drag, setDrag] = useState<{ kind: 'block' | 'chapter'; id: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(guide);
  const fileFor = useRef<{ block: string; target: number | 'backdrop' | 'new' | 'thumb' | string } | null>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  // Keep what you selected clear of the toolbar
  useEffect(() => {
    if (!sel) return;
    const t = requestAnimationFrame(() => {
      const el = document.querySelector('.ed.ed-on, .ve-img.on') || document.querySelector('.ve-block.sel');
      const bar = document.querySelector('.tb');
      if (!el || !bar) return;
      const r = el.getBoundingClientRect(), limit = bar.getBoundingClientRect().bottom + 16;
      if (r.top < limit && r.bottom < window.innerHeight) window.scrollBy({ top: r.top - limit, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(t);
  }, [sel]);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { setGuide(initial); latest.current = initial; setUrls(thumbs); past.current = []; future.current = []; setHist(0); }, [initial, thumbs]);

  // Undo and redo: every change to the guidelines is a step. Quick repeats of the same control (typing a size,
  // stepping it up) count as one step. Inside a text field, ⌘Z undoes typing as usual.
  const past = useRef<Guide[]>([]);
  const future = useRef<Guide[]>([]);
  const lastKey = useRef<{ k: string; t: number } | null>(null);
  const [, setHist] = useState(0);
  const [ask, setAsk] = useState<Ask | null>(null);

  const [rebuildOpen, setRebuildOpen] = useState(false);
  // Arriving from the Overview's "Choose chapters" opens the import straight away
  useEffect(() => { const u = new URL(window.location.href); if (u.searchParams.get('import') === '1') { setRebuildOpen(true); u.searchParams.delete('import'); window.history.replaceState(null, '', u.toString()); } }, []);
  async function rebuild(mode: RebuildMode = 'update', pick?: { chapters?: string[]; showcase?: boolean }) {
    setBusy(true); setMsg(''); setRebuildOpen(false); setSel(null);
    const r = await fetch(`/api/projects/${projectId}/guide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, ...pick }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    const n = (x: number, w: string) => `${x} ${w}${x === 1 ? '' : 's'}`;
    const some = pick?.chapters ? `${n(pick.chapters.length, 'chapter')}` : '';
    const done = some ? (mode === 'fresh' ? `Replaced ${some} with what’s in Figma.` : mode === 'add' ? `Brought in ${some}; anything already here was left as it was.` : `Imported ${some} from Figma. Your edits were kept.`) + ' The other chapters weren’t touched.'
      : mode === 'add' ? (j.added?.chapters || j.added?.sections ? `Added ${n(j.added.chapters, 'new chapter')} and ${n(j.added.sections, 'new section')} from Figma. Everything else is as you left it.` : 'Nothing new in Figma. Everything is as you left it.')
      : mode === 'fresh' ? `Started over: ${n(j.chapters, 'chapter')} built fresh from Figma.` : `Updated ${n(j.chapters, 'chapter')} from Figma. Your edits were kept.`;
    setMsg(r.ok ? done + gapText(j.gaps) : 'The rebuild didn’t finish: ' + (j.error || r.status) + (/token|can’t find/i.test(j.error || '') ? '' : ' Try again in a minute; Figma is sometimes busy.'));
    router.refresh();
  }
  const gapText = (x?: { tier: string | null; drafts: number; missing: number; error?: string }) => !x ? '' : x.error ? ' The tier check didn’t run: ' + x.error : !x.tier ? ' Set a tier on the Overview to have gaps drafted.' : ` ${x.drafts} draft section${x.drafts === 1 ? '' : 's'} and ${x.missing} missing item${x.missing === 1 ? '' : 's'} for the ${tierLabel(x.tier as Tier)} tier.`;
  async function checkGaps() {
    setBusy(true); setMsg('Checking against the tier and drafting the gaps…');
    const r = await fetch(`/api/projects/${projectId}/guide/drafts`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? 'Checked.' + gapText(j) : j.error || 'The check didn’t finish.');
    router.refresh();
  }
  const [dismissed, setDismissed] = useState<string[]>((content.dismissedSlots as string[]) || []);
  async function dismissSlot(slot?: string) {
    if (!slot) return;
    const next = [...new Set([...dismissed, slot])]; setDismissed(next);
    await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { dismissedSlots: next } }) });
  }
  function commit(next: Guide, key?: string) {
    const prev = latest.current;
    if (prev && prev !== next) {
      const now = Date.now();
      const same = !!key && lastKey.current?.k === key && now - lastKey.current.t < 1200;
      if (!same) { past.current.push(prev); if (past.current.length > 200) past.current.shift(); }
      lastKey.current = key ? { k: key, t: now } : null;
      future.current = []; setHist((n) => n + 1);
    }
    save(next);
  }
  function save(next: Guide) {
    setGuide(next); latest.current = next; setMsg('Saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { guide: latest.current } }) });
      setMsg(r.ok ? 'Saved · publish to show the client' : 'Couldn’t save. Check your connection.');
    }, 600);
  }
  function step(dir: 'undo' | 'redo') {
    // Finish any text being typed first, so it becomes its own step
    const a = document.activeElement as HTMLElement | null; if (a?.isContentEditable) a.blur();
    const from = dir === 'undo' ? past.current : future.current, to = dir === 'undo' ? future.current : past.current;
    const target = from.pop(); if (!target || !latest.current) return;
    to.push(latest.current); lastKey.current = null; setHist((n) => n + 1);
    save(target);
    if (!target.chapters.some((c) => c.id === chId && !c.removed)) setChId(target.chapters.find((c) => !c.removed)?.id || '');
    setSel((s) => (s && target.chapters.some((c) => c.blocks.some((b) => b.id === s.block)) ? s : null));
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
      if (e.key === 'Escape' && tool) { setTool(null); return; }
      if (e.key === 'Escape' && !typing && !ask) setSel(null);
      if ((e.key === 'Backspace' || e.key === 'Delete') && !typing && !ask && sel) { e.preventDefault(); deleteSelection(); return; }
      if (!(e.metaKey || e.ctrlKey) || typing) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); step('undo'); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); step('redo'); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  const g = guide;
  const ch = g?.chapters.find((c) => c.id === chId);
  const setChapters = (chapters: GuideChapter[], key?: string) => g && commit({ ...g, chapters }, key);
  const setCh = (patch: Partial<GuideChapter>, key?: string) => g && setChapters(g.chapters.map((c) => (c.id === chId ? { ...c, ...patch } : c)), key);
  const setBlocks = (blocks: Block[], key?: string) => setCh({ blocks }, key);
  const editBlock = (id: string, patch: Partial<Block>, key?: string) => ch && setBlocks(ch.blocks.map((b) => (b.id === id ? { ...b, ...patch, edited: true } : b)), key && `${id}:${key}`);
  const insertAt = (i: number, kind: BlockKind) => {
    if (!ch) return;
    const items = kind === 'carousel' ? [1, 2, 3].map((n) => ({ id: iid(), label: String(n).padStart(2, '0'), heading: 'A headline for this card', body: 'A sentence or two to go with it.' })) : kind === 'columns' ? [1, 2, 3].map(() => ({ id: iid(), label: 'Label', body: 'Text' })) : kind === 'grid' ? [[4, 4], [2, 2], [2, 2], [3, 2], [3, 2]].map(([w, h]) => ({ id: iid(), label: 'Label', body: 'Text', w, h })) : undefined;
    const b: Block = { id: 'b-' + uid(), kind, heading: kind === 'swatches' ? 'Colours' : kind === 'divider' ? 'New subsection' : kind === 'statement' ? 'A statement in the brand’s voice' : kind === 'image' || kind === 'columns' || kind === 'grid' ? undefined : 'New section', body: kind === 'text' || kind === 'split' ? 'Write something…' : '', media: [], swatches: kind === 'swatches' ? [{ name: 'Colour', hex: '#000000' }] : undefined, cols: kind === 'media' ? 2 : kind === 'columns' ? 3 : undefined, side: kind === 'split' ? 'right' : undefined, items, box: kind === 'carousel' ? 'fill' : items ? 'none' : undefined, variant: kind === 'carousel' ? 'cards' : undefined, ...(kind === 'spacer' ? { heading: undefined, body: '', size: 64 } : {}), edited: true };
    const l = [...ch.blocks]; l.splice(i, 0, b); setBlocks(l); setMenu(null); setSel({ block: b.id });
    return b;
  };
  // ---------- placing with the adding bar: pick a tool, the cursor becomes a cross, click where it goes
  type Spot = { mode: 'line' | 'box'; block?: string; item?: number; index?: number; label: string; line: { top: number; left: number; width: number; height: number } };
  const [tool, setTool] = useState<AddWhat | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  useEffect(() => { document.body.classList.toggle('ve-tool', !!tool); return () => document.body.classList.remove('ve-tool'); }, [tool]);
  const WHAT: Record<AddWhat, string> = { headline: 'Headline', text: 'Text', label: 'Label', image: 'Image', box: 'Box', swatch: 'Colour', spacer: 'Spacer' };
  function findSpot(e: React.MouseEvent): Spot | null {
    if (!tool || !ch) return null;
    const t = e.target as HTMLElement;
    const blockEl = t.closest('[data-block]') as HTMLElement | null;
    const box = t.closest('[data-item]') as HTMLElement | null;
    if (box && blockEl && tool !== 'box' && tool !== 'swatch') {
      const r = box.getBoundingClientRect();
      const els = [...box.querySelectorAll('[data-el]')].filter((x) => x.closest('[data-item]') === box) as HTMLElement[];
      const index = els.filter((x) => { const q = x.getBoundingClientRect(); return q.top + q.height / 2 < e.clientY; }).length;
      const y = !els.length ? r.top + r.height / 2 : index === 0 ? els[0].getBoundingClientRect().top - 6 : els[index - 1].getBoundingClientRect().bottom + 6;
      return { mode: 'line', block: blockEl.dataset.block, item: Number(box.dataset.item), index, label: `${WHAT[tool]} here`, line: { top: y - 1, left: r.left + 16, width: r.width - 32, height: 2 } };
    }
    if (box && blockEl && tool === 'box') { const r = box.getBoundingClientRect(); return { mode: 'box', block: blockEl.dataset.block, item: Number(box.dataset.item), label: 'New box after this one', line: { top: r.top, left: r.right + 4, width: 3, height: r.height } }; }
    if (blockEl) { const r = blockEl.getBoundingClientRect(); return { mode: 'box', block: blockEl.dataset.block, label: `${WHAT[tool]} → ${addTarget(tool, ch, { block: blockEl.dataset.block! })}`, line: { top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 } }; }
    return null;
  }
  /** A box's content as a free list of elements, moving any styling with it */
  function materialise(it: BlockItem, styles0: Record<string, TextStyle>) {
    if (it.els) return { els: [...it.els], styles: styles0, ids: {} as Record<string, string> };
    let styles = styles0; const ids: Record<string, string> = {};
    const els = itemEls(it).map((x) => { const id = 'e-' + uid(); ids[x.id] = id; const old = `${it.id}.${x.id}`; if (styles[old]) { const { [old]: st0, ...rest } = styles; styles = { ...rest, [`${it.id}.${id}`]: st0 }; } return { ...x, id }; });
    return { els, styles, ids };
  }
  // ---------- drag to move: an element within or between boxes, or a box among its neighbours. Snaps into place.
  type Drag = { kind: 'el' | 'box' | 'part'; block: string; item: number; el?: string; order?: string[]; label: string; x: number; y: number; target?: { block: string; item: number; index: number }; line?: { top: number; left: number; width: number; height: number } };
  const [moving, setMoving] = useState<Drag | null>(null);
  function startMove(e: React.PointerEvent, kind: 'el' | 'box' | 'part', blockId: string, item: number, el?: string) {
    e.preventDefault(); e.stopPropagation();
    const a0 = document.activeElement as HTMLElement | null; if (a0?.isContentEditable) a0.blur();
    const src = (e.currentTarget as HTMLElement).closest(kind === 'el' ? '[data-el]' : kind === 'part' ? '[data-part]' : '[data-item]') as HTMLElement | null;
    // Parts move among their siblings: headline, text, images and boxes within the section
    const siblings = kind === 'part' && src?.parentElement ? ([...src.parentElement.children] as HTMLElement[]).filter((x) => x.dataset.part) : [];
    const PART: Record<string, string> = { head: 'Headline', body: 'Text', media: 'Images', items: 'Boxes' };
    const label = kind === 'part' ? PART[el || ''] || 'Part' : kind === 'box' ? 'Box' : (src?.innerText || 'Image').trim().slice(0, 40) || 'Image';
    let d: Drag = { kind, block: blockId, item, el, label, x: e.clientX, y: e.clientY, order: siblings.map((x) => x.dataset.part!) };
    setMoving(d); document.body.classList.add('ve-moving'); src?.classList.add('ve-drag-src');
    const move = (ev: PointerEvent) => {
      const under = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const blockEl = under?.closest('[data-block]') as HTMLElement | null;
      let target: Drag['target'], line: Drag['line'];
      if (kind === 'part') {
        const others = siblings.filter((x) => x !== src);
        if (others.length && src?.parentElement) {
          const pr = src.parentElement.getBoundingClientRect();
          const index = others.filter((x) => { const q = x.getBoundingClientRect(); return q.top + q.height / 2 < ev.clientY; }).length;
          const y = index === 0 ? others[0].getBoundingClientRect().top - 8 : others[index - 1].getBoundingClientRect().bottom + 8;
          target = { block: blockId, item: -1, index }; line = { top: y - 1, left: pr.left, width: pr.width, height: 2 };
        }
      } else if (kind === 'el') {
        const box = under?.closest('[data-item]') as HTMLElement | null;
        if (box && blockEl) {
          const r = box.getBoundingClientRect();
          const els = ([...box.querySelectorAll('[data-el]')] as HTMLElement[]).filter((x) => x.closest('[data-item]') === box && x !== src);
          const index = els.filter((x) => { const q = x.getBoundingClientRect(); return q.top + q.height / 2 < ev.clientY; }).length;
          const y = !els.length ? r.top + r.height / 2 : index === 0 ? els[0].getBoundingClientRect().top - 6 : els[index - 1].getBoundingClientRect().bottom + 6;
          target = { block: blockEl.dataset.block!, item: Number(box.dataset.item), index }; line = { top: y - 1, left: r.left + 16, width: r.width - 32, height: 2 };
        }
      } else if (blockEl?.dataset.block === blockId) {
        // Boxes: before or after the nearest box, in reading order
        const boxes = ([...blockEl.querySelectorAll('[data-item]')] as HTMLElement[]).filter((x) => x.closest('[data-block]') === blockEl);
        let best = -1, dist = Infinity;
        boxes.forEach((x, k) => { const q = x.getBoundingClientRect(); const dd = Math.hypot(ev.clientX - (q.left + q.width / 2), ev.clientY - (q.top + q.height / 2)); if (dd < dist) { dist = dd; best = k; } });
        if (best >= 0) { const q = boxes[best].getBoundingClientRect(); const after = ev.clientX > q.left + q.width / 2; target = { block: blockId, item: best, index: best + (after ? 1 : 0) }; line = { top: q.top, left: after ? q.right + 3 : q.left - 5, width: 2, height: q.height }; }
      }
      d = { ...d, x: ev.clientX, y: ev.clientY, target, line }; setMoving(d);
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('ve-moving'); src?.classList.remove('ve-drag-src');
      setMoving(null); if (d.target) drop(d);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }
  function drop(d: Drag) {
    const cur = latest.current; const c = cur?.chapters.find((x) => x.id === chId); if (!cur || !c || !d.target) return;
    if (d.kind === 'part') {
      const order = (d.order || []).filter((p) => p !== d.el); order.splice(Math.min(d.target.index, order.length), 0, d.el!);
      if (order.join() === (d.order || []).join()) return;
      const b = c.blocks.find((x) => x.id === d.block); if (!b) return;
      commit({ ...cur, chapters: cur.chapters.map((x) => (x.id !== chId ? x : { ...x, blocks: x.blocks.map((y) => (y.id === b.id ? { ...y, order: [...order, ...(y.order || []).filter((p) => !order.includes(p))], edited: true } : y)) })) });
      setSel({ block: b.id }); return;
    }
    if (d.kind === 'box') {
      const b = c.blocks.find((x) => x.id === d.block); if (!b) return;
      const items = [...(b.items || [])]; const [moved] = items.splice(d.item, 1); let to = d.target.index; if (to > d.item) to -= 1; if (to === d.item) return;
      items.splice(to, 0, moved);
      commit({ ...cur, chapters: cur.chapters.map((x) => (x.id !== chId ? x : { ...x, blocks: x.blocks.map((y) => (y.id === b.id ? { ...y, items, edited: true } : y)) })) });
      setSel({ block: b.id, item: to }); return;
    }
    const sb = c.blocks.find((x) => x.id === d.block), tb = c.blocks.find((x) => x.id === d.target!.block); if (!sb || !tb) return;
    if (!['columns', 'grid', 'carousel'].includes(tb.kind)) return;
    const sIt = (sb.items || [])[d.item]; const tIt = (tb.items || [])[d.target.item]; if (!sIt || !tIt) return;
    // Take it out of its box
    const ms = materialise(sIt, sb.styles || {});
    const fromId = ms.ids[d.el!] || d.el!; const k = ms.els.findIndex((x) => x.id === fromId); if (k < 0) return;
    const [el] = ms.els.splice(k, 1);
    const styleKey = `${sIt.id}.${el.id}`; const elStyle = ms.styles[styleKey];
    let blocks = c.blocks.map((y) => (y.id !== sb.id ? y : { ...y, edited: true, styles: ms.styles, items: (y.items || []).map((z, n) => (n === d.item ? { ...z, els: ms.els, label: undefined, heading: undefined, body: undefined, media: undefined } : z)) }));
    // And into the target box, at the line
    const tb2 = blocks.find((x) => x.id === tb.id)!; const tIt2 = (tb2.items || [])[d.target.item];
    const mt = materialise(tIt2, tb2.styles || {});
    let index = d.target.index; if (sb.id === tb.id && d.item === d.target.item && k < index) index = index; // the line was measured without the moved element
    mt.els.splice(Math.min(index, mt.els.length), 0, el);
    let tStyles = mt.styles; if (elStyle) { const { [styleKey]: _x, ...rest } = tStyles; void _x; tStyles = { ...(sb.id === tb.id ? rest : tStyles), [`${tIt2.id}.${el.id}`]: elStyle }; }
    blocks = blocks.map((y) => (y.id !== tb.id ? y : { ...y, edited: true, styles: tStyles, items: (y.items || []).map((z, n) => (n === d.target!.item ? { ...z, els: mt.els, label: undefined, heading: undefined, body: undefined, media: undefined } : z)) }));
    commit({ ...cur, chapters: cur.chapters.map((x) => (x.id === chId ? { ...x, blocks } : x)) });
    setSel({ block: tb.id, item: d.target.item, el: `${tIt2.id}.${el.id}` });
  }
  /** Adds a label, headline, text or spacer to a box from the design panel, in its natural place */
  function addToBox(blockId: string, item: number, what: 'label' | 'headline' | 'text' | 'spacer') {
    const c = latest.current?.chapters.find((x) => x.id === chId); const b = c?.blocks.find((x) => x.id === blockId); const it = b?.items?.[item]; if (!b || !it) return;
    const els = itemEls(it);
    const last = (k: string[]) => { let n = -1; els.forEach((e, i) => { if (k.includes(e.kind)) n = i; }); return n; };
    const index = what === 'label' ? 0 : what === 'headline' ? last(['label', 'image']) + 1 : what === 'text' ? Math.max(last(['heading']), last(['text'])) + 1 || els.length : els.length;
    setTool(null);
    place({ mode: 'line', block: blockId, item, index: index <= 0 && what === 'text' ? els.length : index, label: '', line: { top: 0, left: 0, width: 0, height: 0 } }, what);
  }
  function place(sp: Spot | null, forced?: AddWhat) {
    const what = forced || tool; setTool(null); setSpot(null);
    if (!what || !ch) return;
    if (!sp?.block) { setSel(null); add(what, null); return; }
    const b = ch.blocks.find((x) => x.id === sp.block); if (!b) return;
    if (sp.item === undefined) { add(what, { block: b.id }); return; }
    if (what === 'box') { add('box', { block: b.id, item: sp.item }); return; }
    // Into the box, at the point clicked. Its fixed fields become a free list of elements the first time.
    const items = b.items || []; const it = items[sp.item]; if (!it) return;
    const { els, styles } = materialise(it, b.styles || {});
    const kind: ItemEl['kind'] = what === 'headline' ? 'heading' : what === 'text' ? 'text' : what === 'label' ? 'label' : what === 'spacer' ? 'spacer' : 'image';
    const ne: ItemEl = { id: 'e-' + uid(), kind, ...(kind === 'image' ? {} : kind === 'spacer' ? { size: 32 } : { text: kind === 'heading' ? 'Headline' : kind === 'label' ? 'Label' : 'Write something…' }) };
    els.splice(Math.min(sp.index ?? els.length, els.length), 0, ne);
    editBlock(b.id, { items: items.map((x, n) => (n === sp.item ? { ...x, els, label: undefined, heading: undefined, body: undefined, media: undefined } : x)), styles });
    if (kind === 'image') { setSel({ block: b.id, item: sp.item, el: `${it.id}.${ne.id}` }); pickImage(b.id, `itemel:${sp.item}:${ne.id}`); }
    else if (kind === 'spacer') setSel({ block: b.id, item: sp.item, el: `${it.id}.${ne.id}` });
    else { setSel({ block: b.id, item: sp.item, el: `${it.id}.${ne.id}` }); focusNext.current = true; }
  }
  // ---------- Fill with AI: a first draft of the selected text, from what's around it
  const [filling, setFilling] = useState(false);
  async function fillWithAi() {
    if (!ch || !sel?.el || filling) return;
    const a0 = document.activeElement as HTMLElement | null; if (a0?.isContentEditable) a0.blur();
    const cur0 = latest.current; const c0 = cur0?.chapters.find((x) => x.id === chId); if (!c0) return;
    const KIND: Record<string, 'label' | 'heading' | 'text'> = { eyebrow: 'label', label: 'label', kicker: 'label', heading: 'heading', title: 'heading', body: 'text', lede: 'text', text: 'text' };
    let kind: 'label' | 'heading' | 'text' = 'text', current = '', box: { kind: string; text: string; target?: boolean }[] | undefined, others: string[] | undefined;
    let apply: (t: string) => void;
    let section: { kind: string; eyebrow?: string; heading?: string; body?: string } = { kind: 'chapter heading', eyebrow: c0.kicker, heading: c0.title, body: c0.lede };
    let before = '', after = '';
    const writeChapter = (fn: (c: GuideChapter) => GuideChapter) => { const cur = latest.current; if (!cur) return; commit({ ...cur, chapters: cur.chapters.map((x) => (x.id === chId ? fn(x) : x)) }); };
    const writeBlock = (id: string, fn: (b: Block) => Block) => writeChapter((c) => ({ ...c, blocks: c.blocks.map((x) => (x.id === id ? { ...fn(x), edited: true } : x)) }));
    if (sel.block === CHAPTER) {
      const k = sel.el as 'kicker' | 'title' | 'lede'; kind = KIND[k] || 'text'; current = String(c0[k] || '');
      apply = (t) => writeChapter((c) => ({ ...c, [k]: t, edited: true }));
    } else {
      const b = c0.blocks.find((x) => x.id === sel.block); if (!b) return;
      const idx = c0.blocks.indexOf(b);
      before = c0.blocks[idx - 1] ? blockText(c0.blocks[idx - 1]).join(' · ').slice(0, 1200) : '';
      after = c0.blocks[idx + 1] ? blockText(c0.blocks[idx + 1]).join(' · ').slice(0, 1200) : '';
      section = { kind: b.kind, eyebrow: b.eyebrow, heading: b.heading, body: b.body };
      const items = b.items || [];
      if (sel.el.includes('.') && sel.item !== undefined) {
        const field = sel.el.split('.')[1]; const it = items[sel.item]; if (!it) return;
        const els = itemEls(it); const target = els.find((e) => e.id === field);
        if (target?.kind === 'spacer') return;
        kind = target ? (target.kind === 'image' ? 'text' : target.kind) : KIND[field] || 'text'; current = target?.text || '';
        box = els.filter((e) => e.kind !== 'image' && e.kind !== 'spacer').map((e) => ({ kind: e.kind, text: e.text || '', target: e.id === field }));
        others = items.filter((_, n) => n !== sel.item).map((x) => itemWords(x).join(' · ')).filter(Boolean).slice(0, 8);
        const n = sel.item;
        apply = (t) => writeBlock(b.id, (x) => ({ ...x, items: (x.items || []).map((y, k) => (k !== n ? y : y.els ? { ...y, els: y.els.map((e) => (e.id === field ? { ...e, text: t } : e)) } : { ...y, [field]: t })) }));
      } else {
        const field = sel.el as 'eyebrow' | 'heading' | 'body'; if (!['eyebrow', 'heading', 'body'].includes(field)) return;
        kind = KIND[field]; current = String(b[field] || '');
        others = items.map((x) => itemWords(x).join(' · ')).filter(Boolean).slice(0, 8);
        apply = (t) => writeBlock(b.id, (x) => ({ ...x, [field]: t }));
      }
    }
    setFilling(true); setMsg('Writing a first draft…');
    const r = await fetch(`/api/projects/${projectId}/guide/fill`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, current, chapter: { title: c0.title, lede: c0.lede || undefined }, section: { kind: section.kind, eyebrow: section.eyebrow || undefined, heading: section.heading || undefined, body: section.body || undefined }, box, others, before: before || undefined, after: after || undefined }) });
    const j = await r.json().catch(() => ({}));
    setFilling(false);
    if (!r.ok || !j.text) { setMsg(j.error || 'The AI couldn’t write a draft just now.'); return; }
    apply!(j.text); setMsg('Drafted with AI. Check it, then edit or undo (⌘Z).');
  }
  // ---------- Backspace or Delete removes what's selected: a text, an image, a box, or the section
  function deleteSelection() {
    if (!ch || !sel || sel.block === CHAPTER) return;
    const b = ch.blocks.find((x) => x.id === sel.block); if (!b) return;
    const items = b.items || [];
    if (sel.el?.startsWith('img:')) { const k = Number(sel.el.slice(4)); editBlock(b.id, { media: (b.media || []).filter((_, n) => n !== k) }); setSel({ block: b.id }); return; }
    if (sel.el?.startsWith('itemimg:')) { editBlock(b.id, { items: items.map((x, n) => (n === sel.item ? { ...x, media: undefined } : x)) }); setSel({ block: b.id, item: sel.item }); return; }
    if (sel.el && sel.item !== undefined) {
      const [, field] = sel.el.split('.'); const it = items[sel.item];
      if (it?.els) editBlock(b.id, { items: items.map((x, n) => (n === sel.item ? { ...x, els: (x.els || []).filter((y) => y.id !== field) } : x)) });
      else editBlock(b.id, { items: items.map((x, n) => (n === sel.item ? { ...x, [field]: undefined } : x)), off: [...new Set([...(b.off || []), sel.el])] });
      setSel({ block: b.id, item: sel.item }); return;
    }
    if (sel.el) { editBlock(b.id, { [sel.el]: undefined, off: [...new Set([...(b.off || []), sel.el])] } as Partial<Block>); setSel({ block: b.id }); return; }
    if (sel.item !== undefined) { editBlock(b.id, { items: items.filter((_, n) => n !== sel.item) }); setSel({ block: b.id }); return; }
    if (b.source) editBlock(b.id, { hidden: true }); else setBlocks(ch.blocks.filter((x) => x.id !== b.id));
    setSel(null);
  }
  // ---------- adding from the bottom bar: into the selected box, then the section, else a new section below
  const focusNext = useRef(false);
  const selRef = sel;
  useEffect(() => {
    if (!focusNext.current) return; focusNext.current = false;
    const el = document.querySelector('.ed.ed-on') as HTMLElement | null;
    if (el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); const s0 = window.getSelection(); s0?.removeAllRanges(); s0?.addRange(r); }
  });
  const PH: Record<string, string> = { heading: 'Headline', eyebrow: 'Label', label: 'Label', body: 'Write something…' };
  function addSection(kind: BlockKind, from?: Sel | null) {
    if (!ch) return;
    const sel = from === undefined ? selRef : from;
    const at = sel && sel.block !== CHAPTER ? ch.blocks.findIndex((x) => x.id === sel.block) + 1 : ch.blocks.length;
    return insertAt(at > 0 ? at : ch.blocks.length, kind);
  }
  function add(what: AddWhat, at?: Sel | null) {
    if (!ch) return;
    const sel = at === undefined ? selRef : at;
    const b = sel ? ch.blocks.find((x) => x.id === sel.block) : undefined;
    const itemish = !!b && ['columns', 'grid', 'carousel'].includes(b.kind) && b.variant !== 'images';
    const items = b?.items || [];
    const newBox = (p: Partial<BlockItem>) => { if (!b) return; const i = sel?.item !== undefined ? sel.item + 1 : items.length; const it = { id: iid(), w: b.kind === 'grid' ? 2 : 1, h: 2, ...p }; editBlock(b.id, { items: [...items.slice(0, i), it, ...items.slice(i)] }); return { i, it }; };
    const afterSection = (kind: BlockKind, then?: (nb: Block) => void) => { const nb = addSection(kind, sel); if (nb && then) then(nb); };
    if (!b) { // nothing selected: a new section at the end
      const kind: BlockKind = what === 'headline' ? 'divider' : what === 'image' ? 'image' : what === 'box' ? 'columns' : what === 'swatch' ? 'swatches' : what === 'spacer' ? 'spacer' : 'text';
      afterSection(kind, (nb) => { if (what === 'image') pickImage(nb.id, 'new'); });
      return;
    }
    if (what === 'spacer') { afterSection('spacer'); return; }
    if (what === 'swatch') { if (b.kind === 'swatches') editBlock(b.id, { swatches: [...(b.swatches || []), { name: 'Colour', hex: '#000000' }] }); else afterSection('swatches'); return; }
    if (what === 'box') { if (itemish) { const r = newBox(b.kind === 'carousel' ? { label: String(items.length + 1).padStart(2, '0'), heading: 'A headline for this card', body: 'A sentence or two to go with it.' } : { label: 'Label', body: 'Text' }); if (r) setSel({ block: b.id, item: r.i }); } else afterSection('columns'); return; }
    // Inside a selected box
    const it = sel?.item !== undefined && itemish ? items[sel.item] : undefined;
    if (it && sel?.item !== undefined) {
      const field = what === 'headline' ? 'heading' : what === 'label' ? 'label' : 'body';
      if (what === 'image') { if (!it.media) { pickImage(b.id, `item:${sel.item}`); return; } const r = newBox({}); if (r) { setSel({ block: b.id, item: r.i }); pickImage(b.id, `item:${r.i}`); } return; }
      if (!it[field as 'heading']) { editBlock(b.id, { items: items.map((x, n) => (n === sel.item ? { ...x, [field]: PH[field] } : x)), off: (b.off || []).filter((k) => k !== `${it.id}.${field}`) }); setSel({ block: b.id, item: sel.item, el: `${it.id}.${field}` }); focusNext.current = true; return; }
      const r = newBox({ [field]: PH[field] }); if (r) { setSel({ block: b.id, item: r.i, el: `${r.it.id}.${field}` }); focusNext.current = true; } return;
    }
    // Inside a section with boxes: text and images arrive as a new box
    if (itemish && (what === 'text' || what === 'image')) { const r = newBox(what === 'text' ? { body: PH.body } : {}); if (r) { setSel({ block: b.id, item: r.i, el: what === 'text' ? `${r.it.id}.body` : undefined }); if (what === 'image') pickImage(b.id, `item:${r.i}`); else focusNext.current = true; } return; }
    if (what === 'image') { if (['split', 'media', 'image', 'text'].includes(b.kind) || b.kind === 'carousel') pickImage(b.id, 'new'); else afterSection('image', (nb) => pickImage(nb.id, 'new')); return; }
    const field = what === 'headline' ? 'heading' : what === 'label' ? 'eyebrow' : 'body';
    if (b.kind === 'divider' && what !== 'headline') { afterSection(what === 'text' ? 'text' : 'text'); return; }
    if (!b[field as 'heading']) { editBlock(b.id, { [field]: PH[field], off: (b.off || []).filter((k) => k !== field) } as Partial<Block>); setSel({ block: b.id, el: field }); focusNext.current = true; return; }
    afterSection(what === 'headline' ? 'divider' : 'text');
  }
  const moveBlock = (id: string, toId: string) => { if (!ch || id === toId) return; const l = [...ch.blocks]; const from = l.findIndex((b) => b.id === id); const [b] = l.splice(from, 1); l.splice(l.findIndex((x) => x.id === toId), 0, b); setBlocks(l); };
  const moveChapter = (id: string, toId: string) => { if (!g || id === toId) return; const l = [...g.chapters]; const from = l.findIndex((c) => c.id === id); const [c] = l.splice(from, 1); l.splice(l.findIndex((x) => x.id === toId), 0, c); setChapters(l); };

  async function upload(file: File): Promise<BlockMedia | null> {
    const dims = await new Promise<{ w: number; h: number }>((ok) => { const im = new Image(); im.onload = () => ok({ w: im.naturalWidth || 1200, h: im.naturalHeight || 800 }); im.onerror = () => ok({ w: 1200, h: 800 }); im.src = URL.createObjectURL(file); });
    const fd = new FormData(); fd.set('file', file); setMsg('Uploading…');
    const r = await fetch(`/api/projects/${projectId}/guide/upload`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'Upload failed.'); return null; }
    setUrls((u) => ({ ...u, [j.path]: j.url })); setMsg('');
    return { path: j.path, w: dims.w, h: dims.h, kind: file.type === 'image/svg+xml' ? 'graphic' : 'photo' };
  }
  function pickImage(block: string, target: number | 'backdrop' | 'new' | 'thumb' | string) { fileFor.current = { block, target }; fileInput.current?.click(); }
  async function onFile(f?: File) {
    const t = fileFor.current; if (!f || !t || !ch) return;
    const up = await upload(f); if (!up) return;
    if (t.target === 'thumb') { setCh({ thumb: up.path }); return; }
    const b = ch.blocks.find((x) => x.id === t.block); if (!b) return;
    if (typeof t.target === 'string' && t.target.startsWith('itemel:')) { const [, k, elId] = t.target.split(':'); editBlock(b.id, { items: (b.items || []).map((x, n) => (n === Number(k) ? { ...x, els: (x.els || []).map((e) => (e.id === elId ? { ...e, media: up } : e)) } : x)) }); return; }
    if (typeof t.target === 'string' && t.target.startsWith('item:')) { const k = Number(t.target.slice(5)); editBlock(b.id, { items: (b.items || []).map((x, n) => (n === k ? { ...x, media: up } : x)) }); return; }
    if (t.target === 'backdrop') editBlock(b.id, { backdrop: up });
    else if (t.target === 'new') editBlock(b.id, { media: [...(b.media || []), up] });
    else editBlock(b.id, { media: (b.media || []).map((m, i) => (i === t.target ? { ...up, caption: m.caption } : m)) });
  }

  if (!g) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
      <p className="mute" style={{ margin: 0 }}>Reads the Figma page and rebuilds every slide as live web content. Then edit it here exactly as the client will see it.</p>
      <div className="row"><button className="btn solid" disabled={busy} onClick={() => rebuild('fresh')}>Build guidelines from Figma</button><span className="mute">{msg}</span></div>
      <TimedProgress label="Reading Figma and rebuilding every slide" expected={90} running={busy} />
    </div>
  );

  const kitFor = (b: Block): EditKit => ({
    text: (field: TextField, value, el) => (!value ? null : <Editable key={field} value={value} tag={el.tag} className={el.className} placeholder={el.placeholder} multiline={el.multiline} style={el.style} on={sel?.block === b.id && sel.el === field} onFocus={() => setSel({ block: b.id, el: field })} onSave={(v) => editBlock(b.id, { [field]: v || undefined } as Partial<Block>)} />),
    image: (target, _m, imgEl) => <span className={'ve-img' + (sel?.block === b.id && sel.el === `img:${target}` ? ' on' : '')} onMouseDown={(e) => { e.stopPropagation(); setSel({ block: b.id, el: `img:${target}` }); }}>{imgEl}</span>,
    caption: (i, value) => (value === undefined ? null : <Editable value={value} tag="p" className="gb-cap" placeholder="Caption" onSave={(v) => editBlock(b.id, { media: (b.media || []).map((x, k) => (k === i ? { ...x, caption: v || undefined } : x)) })} />),
    swatch: (i, s) => { const set = (p: Partial<typeof s>) => editBlock(b.id, { swatches: (b.swatches || []).map((x, k) => (k === i ? { ...x, ...p } : x)) }); return (
      <div key={i} className="gb-swc ve-sw" style={{ background: s.hex, color: textOn(s.hex) }}>
        <Editable value={s.name} tag="span" className="gb-swn" placeholder="Name" onSave={(v) => set({ name: v || 'Colour' })} />
        <span className="sw-meta"><Editable value={s.hex} tag="span" className="sw-hex" placeholder="#000000" onSave={(v) => { const h = v.trim().toUpperCase().replace(/^([0-9A-F]{6})$/, '#$1'); if (/^#[0-9A-F]{6}$/.test(h)) set({ hex: h }); }} /><Editable value={s.note} tag="span" className="" placeholder="Note, e.g. CMYK" onSave={(v) => set({ note: v || undefined })} /></span>
        <span className="ve-swbar"><label title="Pick colour"><input type="color" value={/^#[0-9A-F]{6}$/i.test(s.hex) ? s.hex : '#000000'} onChange={(e) => set({ hex: e.target.value.toUpperCase() })} aria-label={`Colour for ${s.name}`} />●</label><button onClick={() => editBlock(b.id, { swatches: (b.swatches || []).filter((_, k) => k !== i) })} aria-label={`Remove ${s.name}`}>×</button></span>
      </div>); },
    addSwatch: () => <button key="add" className="gb-swc ve-add" onClick={() => editBlock(b.id, { swatches: [...(b.swatches || []), { name: 'Colour', hex: '#000000' }] })}>+ Swatch</button>,
    addImage: () => <button key="addimg" className="ve-add ve-addimg" onClick={() => pickImage(b.id, 'new')}>+ Add image</button>,
    itemText: (i, field, value, el) => (!value ? null : <Editable key={field} value={value} tag={el.tag} className={el.className} placeholder={el.placeholder} multiline={el.multiline} style={el.style} on={sel?.block === b.id && sel.el === el.key} onFocus={() => setSel({ block: b.id, el: el.key, item: i })} onSave={(v) => editBlock(b.id, { items: (b.items || []).map((x, n) => (n === i ? { ...x, [field]: v || undefined } : x)) })} />),
    itemElText: (i, e, el) => <Editable key={e.id} value={e.text} tag={el.tag} className={el.className} placeholder={el.placeholder} multiline={el.multiline} style={el.style} on={sel?.block === b.id && sel.el === el.key} onFocus={() => setSel({ block: b.id, el: el.key, item: i })} onSave={(v) => editBlock(b.id, { items: (b.items || []).map((x, n) => (n === i ? { ...x, els: (x.els || []).map((y) => (y.id === e.id ? { ...y, text: v || undefined } : y)) } : x)) })} />,
    itemElImage: (i, e, img) => { const key = `${(b.items || [])[i]?.id}.${e.id}`; return img ? <span className={'ve-img' + (sel?.block === b.id && sel.el === key ? ' on' : '')} onMouseDown={(ev) => { ev.stopPropagation(); setSel({ block: b.id, el: key, item: i }); }}>{img}</span> : <button className={'ve-add ve-elimg' + (sel?.block === b.id && sel.el === key ? ' on' : '')} onMouseDown={(ev) => { ev.stopPropagation(); setSel({ block: b.id, el: key, item: i }); }} onClick={() => pickImage(b.id, `itemel:${i}:${e.id}`)}><ImageIcon size={16} strokeWidth={1.75} aria-hidden />Choose an image</button>; },
    itemImage: (i, m, pic) => <span className={'ve-img' + (sel?.block === b.id && sel.el === `itemimg:${i}` ? ' on' : '')} onMouseDown={(e) => { e.stopPropagation(); setSel({ block: b.id, el: `itemimg:${i}`, item: i }); }}>{pic}</span>,
    addItem: () => sel?.block === b.id ? <button key="additem" className="ve-add ve-additem" style={b.kind === 'grid' ? { gridColumn: 'span 2' } : undefined} onClick={() => { editBlock(b.id, { items: [...(b.items || []), { id: iid(), label: b.kind === 'carousel' ? String((b.items || []).length + 1).padStart(2, '0') : 'Label', ...(b.kind === 'carousel' ? { heading: 'A headline for this card' } : { body: 'Text' }), w: b.kind === 'grid' ? 2 : 1, h: 2 }] }); setSel({ block: b.id, item: (b.items || []).length }); }}><Plus size={15} strokeWidth={1.75} aria-hidden />{b.kind === 'carousel' ? 'Card' : 'Box'}</button> : null,
    // The selected box: an outline and handles to drag its width (and height, in a grid) across the columns
    partGrip: (part) => <span className="ve-grip-el ve-grip-part" onPointerDown={(e) => startMove(e, 'part', b.id, -1, part)} title="Drag to move" aria-hidden><GripVertical size={14} strokeWidth={2} /></span>,
    grip: (i, elId) => ['columns', 'grid', 'carousel'].includes(b.kind) ? <span className="ve-grip-el" onPointerDown={(e) => startMove(e, 'el', b.id, i, elId)} title="Drag to move" aria-hidden><GripVertical size={14} strokeWidth={2} /></span> : null,
    itemBar: (i) => sel?.block === b.id && sel.item === i ? <>
      <span className="ve-itemsel" aria-hidden />
      <span className="ve-grip-box" onPointerDown={(e) => startMove(e, 'box', b.id, i)} title="Drag to move this box" aria-hidden><GripVertical size={12} strokeWidth={2} />Box</span>
      {b.kind === 'columns' || b.kind === 'grid' ? <span className="ve-hd ve-hd-r" onPointerDown={(e) => startResize(e, b, i, 'x')} role="slider" aria-label="Drag to change width" aria-valuenow={b.items?.[i]?.w || 1} title="Drag to change width" /> : null}
      {b.kind === 'grid' ? <><span className="ve-hd ve-hd-b" onPointerDown={(e) => startResize(e, b, i, 'y')} title="Drag to change height" aria-hidden /><span className="ve-hd ve-hd-c" onPointerDown={(e) => startResize(e, b, i, 'xy')} title="Drag to resize" aria-hidden /></> : null}
    </> : null
  });

  // Drag a box's edge across the columns (and rows): snaps to the grid, one column or row at a time
  function startResize(e: React.PointerEvent, b: Block, i: number, axis: 'x' | 'y' | 'xy') {
    e.preventDefault(); e.stopPropagation();
    const box = (e.currentTarget as HTMLElement).closest('[data-item]')?.parentElement; if (!box) return;
    const cs = getComputedStyle(box); const rect = box.getBoundingClientRect();
    const grid = b.kind === 'grid';
    const n = grid ? b.gridCols || 6 : Math.max(1, Math.min(6, b.cols || (b.items || []).length || 2));
    const gap = parseFloat(cs.columnGap) || 0, rgap = parseFloat(cs.rowGap) || 0;
    const colW = (rect.width - gap * (n - 1)) / n;
    const rowH = grid ? parseFloat(cs.gridAutoRows.split(' ').pop() || '64') || 64 : 0;
    const items = b.items || []; const it = items[i];
    const w0 = Math.min(n, it.w || (grid ? 2 : 1)), h0 = it.h || 2;
    const x0 = e.clientX, y0 = e.clientY; let last = `${w0}x${h0}`;
    document.body.classList.add(axis === 'y' ? 've-resizing-y' : 've-resizing');
    const move = (ev: PointerEvent) => {
      const w = axis === 'y' ? w0 : Math.max(1, Math.min(n, w0 + Math.round((ev.clientX - x0) / (colW + gap))));
      const h = axis === 'x' ? h0 : Math.max(1, Math.min(8, h0 + Math.round((ev.clientY - y0) / (rowH + rgap))));
      if (`${w}x${h}` === last) return; last = `${w}x${h}`;
      editBlock(b.id, { items: items.map((x, k) => (k === i ? { ...x, w, ...(grid ? { h } : {}) } : x)) }, `resize-${i}`);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('ve-resizing', 've-resizing-y'); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }
  const subsIdx = (id: string) => { const subs = ch ? ch.blocks.filter((b) => b.kind === 'divider' && !b.hidden) : []; const k = subs.findIndex((b) => b.id === id); return k >= 0 ? String(k + 1).padStart(2, '0') : undefined; };
  const hiddenCount = ch ? ch.blocks.filter((b) => b.hidden).length : 0;
  function deleteChapter(c: GuideChapter) {
    if (!g) return;
    const fromFigma = !c.id.startsWith('custom-') && !c.id.startsWith('draft-');
    setAsk({
      title: `Delete “${c.title}”?`,
      body: fromFigma ? 'The chapter and its sections come off the guidelines. It stays deleted when you rebuild from Figma, and you can restore it from Deleted chapters or undo.' : 'The chapter and its sections come off the guidelines. You can undo this.',
      yes: 'Delete chapter',
      run: () => {
        const cur = latest.current; if (!cur) return;
        const next = fromFigma ? cur.chapters.map((x) => (x.id === c.id ? { ...x, removed: true } : x)) : cur.chapters.filter((x) => x.id !== c.id);
        commit({ ...cur, chapters: next });
        if (c.id === chId) { setChId(next.find((x) => !x.removed)?.id || ''); setSel(null); }
      }
    });
  }
  // The chapter's label, title and introduction use the same toolbar as any other text
  const chText = (k: string, cls: string) => { const t = textProps(ch?.styles?.[k]); return { className: [cls, t.className].filter(Boolean).join(' '), style: t.style, on: sel?.block === CHAPTER && sel.el === k, onFocus: () => setSel({ block: CHAPTER, el: k }) }; };
  const setChStyle = (field: string, st: TextStyle, key?: string) => ch && setCh({ styles: { ...(ch.styles || {}), [field]: st }, edited: true }, key && `ch:${field}:${key}`);
  const all = g.chapters.flatMap((c) => c.blocks);
  const nDraft = all.filter((b) => b.draft === 'draft').length, nMissing = all.filter((b) => b.draft === 'missing').length;
  const chDrafts = (c: GuideChapter) => c.blocks.filter((b) => b.draft).length;
  const accept = (b: Block) => editBlock(b.id, { draft: undefined, draftNote: undefined });
  const removeBlock = (b: Block) => ch && setBlocks(ch.blocks.filter((x) => x.id !== b.id));

  return (
    <div className="ve">
      <style>{fontCss}</style>{liveFontCss ? <style>{liveFontCss}</style> : null}
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="ve-top">
        <button className="btn solid ic" disabled={busy} onClick={() => setRebuildOpen(true)} aria-haspopup="dialog"><RefreshCw size={15} strokeWidth={1.75} aria-hidden />Import from Figma</button>
        <a className="btn ic" href={`/p/${slug}/guidelines`} target="_blank" rel="noopener"><ExternalLink size={15} strokeWidth={1.75} aria-hidden />Preview as client</a>
        <button className={'btn ic' + (showHidden ? ' solid' : '')} aria-pressed={showHidden} onClick={() => setShowHidden(!showHidden)}>{showHidden ? <Eye size={15} strokeWidth={1.75} aria-hidden /> : <EyeOff size={15} strokeWidth={1.75} aria-hidden />}{showHidden ? 'Showing hidden' : 'Show hidden'}{hiddenCount ? ` (${hiddenCount})` : ''}</button>
        <span className="ve-tier">{tier ? `${tierLabel(tier)} tier` : 'No tier set'}{nDraft || nMissing ? ` · ${[nDraft ? `${nDraft} draft${nDraft === 1 ? '' : 's'} to check` : '', nMissing ? `${nMissing} missing` : ''].filter(Boolean).join(' · ')}` : ''}</span>
        {tier ? <button className="btn ic" disabled={busy} onClick={checkGaps}><ScanSearch size={15} strokeWidth={1.75} aria-hidden />Check for gaps</button> : <a className="btn" href="?tab=overview">Set a tier</a>}
        <span className="mute" role="status">{msg}</span>
      </div>
      {(g.version || 1) < 2 ? <div className="card" role="status" style={{ borderColor: '#000' }}><p style={{ margin: 0 }}>These guidelines were built with an older version, so some pages may still show slide images.</p><p className="mute" style={{ margin: '4px 0 8px' }}>Rebuild to get live text, colour swatches you can click to copy, and subsections. Your edits are kept.</p><button className="btn solid" disabled={busy} onClick={() => setRebuildOpen(true)}>Rebuild now</button></div> : null}
      <TimedProgress label="Reading Figma and rebuilding every slide" expected={Math.max(45, g.chapters.reduce((n, c) => n + c.blocks.length, 0) * 2)} running={busy} />

      <div className="ve-grid">
        <nav className="ve-chs" aria-label="Chapters">
          {home ? <div className={'ve-ch ve-home' + (chId === HOME ? ' on' : '')}><button onClick={() => { setChId(HOME); setSel(null); }}><House size={14} strokeWidth={1.75} aria-hidden />Home page</button></div> : null}
          <p className="ve-label">Chapters · drag to reorder</p>
          {g.chapters.filter((c) => !c.removed).map((c, i) => <div key={c.id} draggable onDragStart={() => setDrag({ kind: 'chapter', id: c.id })} onDragOver={(e) => { if (drag?.kind === 'chapter') { e.preventDefault(); setOver(c.id); } }} onDrop={() => { if (drag?.kind === 'chapter') moveChapter(drag.id, c.id); setDrag(null); setOver(null); }} onDragEnd={() => { setDrag(null); setOver(null); }}
            className={'ve-ch' + (c.id === chId ? ' on' : '') + (c.hidden ? ' off' : '') + (over === c.id && drag?.kind === 'chapter' ? ' over' : '')}>
            <span className="ve-grip" aria-hidden><GripVertical size={14} strokeWidth={1.75} /></span>
            <button onClick={() => { setChId(c.id); setSel(null); }}><span className="pt-n">{String(i + 1).padStart(2, '0')}</span>{c.title}{chDrafts(c) ? <span className="ve-dcount" title="Drafts and missing items to check">{chDrafts(c)}</span> : null}</button>
            <button className={'ve-eye' + (c.hidden ? ' on' : '')} onClick={() => setChapters(g.chapters.map((x) => (x.id === c.id ? { ...x, hidden: !x.hidden } : x)))} aria-label={c.hidden ? `Show ${c.title} to the client` : `Hide ${c.title} from the client`} data-tip={c.hidden ? 'Hidden. Show it' : 'Hide from the client'}>{c.hidden ? <EyeOff size={14} strokeWidth={1.75} aria-hidden /> : <Eye size={14} strokeWidth={1.75} aria-hidden />}</button>
            <button className="ve-eye ve-del" onClick={() => deleteChapter(c)} aria-label={`Delete ${c.title}`} data-tip="Delete chapter"><Trash2 size={14} strokeWidth={1.75} aria-hidden /></button>
          </div>)}
          {g.chapters.some((c) => c.removed) ? <div className="ve-removed"><button className="ve-linkbtn" onClick={() => setShowRemoved(!showRemoved)} aria-expanded={showRemoved}>Deleted chapters ({g.chapters.filter((c) => c.removed).length})</button>
            {showRemoved ? g.chapters.filter((c) => c.removed).map((c) => <div key={c.id} className="ve-removed-row"><span>{c.title}</span><button className="ve-linkbtn" onClick={() => setChapters(g.chapters.map((x) => (x.id === c.id ? { ...x, removed: false } : x)))}>Restore</button></div>) : null}</div> : null}
          <button className="btn ic" style={{ marginTop: 8 }} onClick={() => { const c: GuideChapter = { id: 'custom-' + uid(), key: null, title: 'New chapter', kicker: '', lede: '', edited: true, blocks: [], rules: [] }; setChapters([...g.chapters, c]); setChId(c.id); setSel(null); }}><Plus size={15} strokeWidth={1.75} aria-hidden />Chapter</button>
        </nav>

        {chId === HOME && home ? <><HomeEditor projectId={projectId} home={home} colours={colours} fonts={toolbarFonts(fonts)} onAddFont={(then) => setFontAsk(() => then)} chapters={g.chapters.filter((c) => !c.hidden && !c.removed).map((c) => c.title)} />
          <aside className="dp" aria-label="About the home page"><div className="dp-sec"><p className="dp-h"><House size={15} strokeWidth={1.75} aria-hidden />Home page</p><p className="dp-tip" style={{ padding: 0 }}>The first page clients see. Click the title or the welcome to edit them, with the same text tools as the guidelines. Leave the welcome empty to use the standard one. Changes here show straight away, without publishing.</p><p className="dp-tip" style={{ padding: 0 }}>The showcase reel runs above it, and the chapters and recently used apps follow below.</p></div></aside></> : null}
        {ch ? <div className="ve-main">
          <Toolbar onFill={fillWithAi} filling={filling} sel={sel} setSel={setSel} ch={ch} colours={colours} fonts={toolbarFonts(fonts)} onAddFont={(then) => setFontAsk(() => then)} setChStyle={setChStyle} setBlocks={setBlocks} editBlock={editBlock} pickImage={pickImage} undo={() => step('undo')} redo={() => step('redo')} canUndo={past.current.length > 0} canRedo={future.current.length > 0}
            onDelete={(b) => { if (b.source) editBlock(b.id, { hidden: true }); else setBlocks(ch.blocks.filter((x) => x.id !== b.id)); setSel(null); }}
            onReset={(b) => setAsk({ title: 'Reset this section?', body: 'Your edits to it are discarded and it refreshes from Figma on the next rebuild. You can undo this.', yes: 'Reset section', run: () => setBlocks(ch.blocks.map((x) => (x.id === b.id ? { ...x, edited: false } : x))) })} />
          <section className="ve-chset" aria-label="Chapter settings">
            <p className="ve-chset-h">Chapter settings <span>Not shown on the page</span></p>
            <div className="ve-cover">
                <div className="ve-cover-pv pt-chthumb"><ChapterCover c={ch} i={g.chapters.indexOf(ch)} g={g} urls={urls} colours={colours} logoUrl={logoUrl} /></div>
                <div className="ve-cover-txt">
                  <p className="ve-label">Cover on the home page · {({ upload: 'your thumbnail', slide: 'the opening slide', logo: 'the logo', type: 'the typeface', colour: 'the palette', grid: 'the dot grid', imagery: 'a carousel of the photography', voice: 'three key words', image: 'the chapter’s first image', title: 'the chapter title' } as Record<string, string>)[coverKind(ch, g.chapters.indexOf(ch))]}</p>
                  {coverKind({ ...ch, thumb: undefined }, g.chapters.indexOf(ch)) === 'type' && !ch.thumb ? <label className="ve-cover-f">Type sample<input className="in" defaultValue={ch.thumbSample || ''} placeholder="Auto: abc or Abc, matching the brand" onBlur={(e) => setCh({ thumbSample: e.target.value.trim() || undefined })} /></label> : null}
                  {coverKind({ ...ch, thumb: undefined }, g.chapters.indexOf(ch)) === 'voice' && !ch.thumb ? <label className="ve-cover-f">Three key words<input className="in" defaultValue={ch.thumbWords || ''} placeholder="Auto from the headlines. e.g. Warm, Curious, Direct" onBlur={(e) => setCh({ thumbWords: e.target.value.trim() || undefined })} /></label> : null}
                  <div className="row"><button className="btn ic" onClick={() => pickImage('', 'thumb')}><Upload size={15} strokeWidth={1.75} aria-hidden />{ch.thumb ? 'Replace thumbnail' : 'Upload a thumbnail'}</button>{ch.thumb ? <button className="btn" onClick={() => setCh({ thumb: undefined })}>Use the generated cover</button> : null}</div>
                </div>
              </div>
          </section>
          <div className={'ve-canvas pt' + (tool ? ' ve-adding' : '')} onMouseMoveCapture={(e) => { if (tool) setSpot(findSpot(e)); }} onMouseLeave={() => setSpot(null)} onMouseDownCapture={(e) => { if (!tool) return; e.preventDefault(); e.stopPropagation(); place(findSpot(e)); }} onClickCapture={(e) => { if (tool) { e.preventDefault(); e.stopPropagation(); } }}>
          <article className="pt-page ve-page">
            <header className="pt-chhead ve-chhead">
              <p className="mute"><span className="pt-n">{String(g.chapters.indexOf(ch) + 1).padStart(2, '0')}</span><Editable value={ch.kicker} tag="span" {...chText('kicker', '')} placeholder="Label" onSave={(v) => setCh({ kicker: v, edited: true })} /></p>
              <Editable value={ch.title} tag="h1" {...chText('title', 'pt-display')} placeholder="Chapter title" onSave={(v) => setCh({ title: v || 'Untitled', edited: true })} />
              <Editable value={ch.lede} tag="p" {...chText('lede', 'pt-lede')} placeholder="Add an introduction (optional)" multiline onSave={(v) => setCh({ lede: v, edited: true })} />
              {ch.hidden ? <p className="tag">This chapter is hidden from the client</p> : null}
            </header>

            <div className="pt-blocks ve-blocks">
              <Inserter open={menu === 'i0'} onOpen={() => setMenu(menu === 'i0' ? null : 'i0')} onPick={(k) => insertAt(0, k)} />
              {ch.blocks.map((b, i) => (b.hidden && !showHidden ? null : (
                <div key={b.id}>
                  {b.draft ? <div className={'ve-draft ' + b.draft} role="note">
                    <span className="ve-draft-tag">{b.draft === 'draft' ? 'Draft, check this' : 'Missing'}</span>
                    <span className="ve-draft-note">{b.draftNote}{b.draft === 'missing' && b.body ? ` For this tier: ${b.body}` : ''}</span>
                    {b.draft === 'draft' ? <><button className="btn solid" onClick={() => accept(b)}>Accept</button><button className="btn" onClick={() => removeBlock(b)}>Delete</button></>
                      : <><button className="btn solid" onClick={() => editBlock(b.id, { draft: undefined, draftNote: undefined, body: '' })}>Write it now</button><button className="btn" onClick={() => { removeBlock(b); dismissSlot(b.slot); }} title="Not needed for this client; it won’t be flagged again">Not needed</button></>}
                    <span className="mute">Hidden from the client until accepted.</span>
                  </div> : null}
                  <div onMouseDown={(e) => {
                    // A click on a box (not its text or image) selects the box; anywhere else selects the section
                    const t = e.target as HTMLElement; const box = t.closest('[data-item]') as HTMLElement | null;
                    const spacer = t.closest('[data-spacer]') as HTMLElement | null;
                    if (spacer && box && !t.closest('.ve-grip-el')) { const it0 = (b.items || [])[Number(box.dataset.item)]; if (it0) { setSel({ block: b.id, item: Number(box.dataset.item), el: `${it0.id}.${spacer.dataset.el}` }); return; } }
                    if (box && !t.closest('.ed, .ve-img, .ve-hd') && box.closest('.ve-block') === e.currentTarget) setSel({ block: b.id, item: Number(box.dataset.item) });
                    else if (sel?.block !== b.id) setSel({ block: b.id });
                  }} data-block={b.id} className={'ve-block' + (sel?.block === b.id ? ' sel' : '') + (b.hidden ? ' off' : '') + (b.draft ? ' is-draft' : '') + (over === b.id && drag?.kind === 'block' ? ' over' : '')}
                    onDragOver={(e) => { if (drag?.kind === 'block') { e.preventDefault(); setOver(b.id); } }} onDrop={() => { if (drag?.kind === 'block') moveBlock(drag.id, b.id); setDrag(null); setOver(null); }}>
                    {sel?.block === b.id ? <span className="ve-handle-tab" draggable onDragStart={() => setDrag({ kind: 'block', id: b.id })} onDragEnd={() => { setDrag(null); setOver(null); }} title="Drag to move" aria-label="Drag to move"><GripVertical size={12} strokeWidth={2} aria-hidden />{KINDS.find(([k]) => k === b.kind)?.[1]}</span> : <span className="ve-hint">Click to edit</span>}
                    {b.hidden ? <p className="ve-hidden">Hidden from the client · <button onClick={() => editBlock(b.id, { hidden: false })}>Show</button></p> : null}
                    <GuideBlock b={{ ...b, hidden: false }} urls={urls} headingLevel={3} number={b.kind === 'divider' ? subsIdx(b.id) : undefined} chapter={ch.title} edit={kitFor(b)} />
                  </div>
                  <Inserter open={menu === 'i' + (i + 1)} onOpen={() => setMenu(menu === 'i' + (i + 1) ? null : 'i' + (i + 1))} onPick={(k) => insertAt(i + 1, k)} />
                </div>)))}
              {!ch.blocks.length ? <p className="mute">This chapter is empty. Use + to add a section.</p> : null}
            </div>

            {ch.rules.length ? <section className="pt-blk"><h2 className="pt-h2">The rules</h2><p className="mute" style={{ marginTop: -6 }}>From the review. Change them in the Review tab.</p><div className="pt-rules">{ch.rules.map((r, k) => <div key={k} className="pt-rule"><p className="pt-rule-h">{r.title}</p><p>{r.text}</p></div>)}</div></section> : null}
          </article>
        </div></div> : null}
        {ch ? <AddBar ch={ch} sel={sel?.block === CHAPTER ? null : sel} tool={tool} onTool={(w) => { setTool(w); setSpot(null); }} onSection={(k) => addSection(k)} /> : null}
        {moving ? <><div className="ve-ghost" style={{ left: moving.x + 14, top: moving.y + 10 }} aria-hidden>{moving.label}</div>{moving.line ? <div className={'ve-spot ' + (moving.kind === 'box' ? 'vline' : 'line')} style={{ top: moving.line.top, left: moving.line.left, width: moving.line.width, height: moving.line.height }} aria-hidden /> : null}</> : null}
        {tool && spot ? <div className={'ve-spot ' + spot.mode} style={{ top: spot.line.top, left: spot.line.left, width: spot.line.width, height: spot.line.height }} aria-hidden><span>{spot.label}</span></div> : null}
        {ch ? <Inspector onAddToBox={addToBox} sel={sel?.block === CHAPTER ? null : sel} setSel={setSel} ch={ch} colours={colours} editBlock={editBlock} pickImage={pickImage} /> : null}
      </div>
      {ask ? <Confirm ask={ask} onClose={() => setAsk(null)} /> : null}
      {fontAsk ? <FontDialog projectId={projectId} fonts={fonts} onClose={() => setFontAsk(null)} onDone={(next, urls, role) => { setFonts(next); setLiveFontCss(fontFaceCss(next, urls)); fontAsk(role); setFontAsk(null); }} /> : null}
      {rebuildOpen ? <ImportDialog projectId={projectId} onClose={() => setRebuildOpen(false)} onRun={rebuild} /> : null}
      <p className="mute">Built {new Date(g.generatedAt).toLocaleString('en-GB')} from “{g.page}” in {g.file}. Sections you edit or add are kept when you rebuild.</p>
    </div>
  );
}

function Inserter({ open, onOpen, onPick }: { open: boolean; onOpen: () => void; onPick: (k: BlockKind) => void }) {
  return <div className={'ve-ins' + (open ? ' open' : '')}>
    <button className="ve-ins-btn" onClick={onOpen} aria-expanded={open} aria-label="Add a section here" data-tip="Add a section"><Plus size={16} strokeWidth={2} aria-hidden /></button>
    {open ? <div className="ve-menu" role="menu">{KINDS.map(([k, l]) => <button key={k} role="menuitem" onClick={() => onPick(k)}><KindIcon k={k} />{l}</button>)}</div> : null}
  </div>;
}

const KIND_ICON: Record<BlockKind, LucideIcon> = { cover: PanelTop, divider: Heading, text: AlignLeft, columns: Columns3, grid: LayoutGrid, statement: Quote, split: PanelLeft, image: ImageIcon, media: Images, carousel: GalleryHorizontal, swatches: Palette, spacer: UnfoldVertical };
export function KindIcon({ k }: { k: BlockKind }) {
  const Ic = KIND_ICON[k] || AlignLeft;
  return <Ic size={16} strokeWidth={1.75} aria-hidden />;
}

/** Upload a typeface from the editor. It's added to the project's Typefaces, so it's also in the kit and the portal. */
function FontDialog({ projectId, fonts, onClose, onDone }: { projectId: string; fonts: ProjectFont[]; onClose: () => void; onDone: (fonts: ProjectFont[], urls: Record<string, string>, role: string) => void }) {
  const [name, setName] = useState(''); const [label, setLabel] = useState('');
  const [files, setFiles] = useState<File[]>([]); const [licence, setLicence] = useState<'trial' | 'licensed'>('trial');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }, [onClose, busy]);
  async function go() {
    if (!name.trim() || !files.length) { setErr('Add the family name and at least one font file.'); return; }
    setBusy(true); setErr('');
    const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'font';
    let role = base; for (let n = 2; fonts.some((f) => f.role === role); n++) role = `${base}-${n}`;
    const meta = [...fonts.map(({ role, label, name, licenceNote }) => ({ role, label, name, ...(licenceNote ? { licenceNote } : {}) })), { role, label: label.trim() || name.trim(), name: name.trim() }];
    const put = await fetch(`/api/projects/${projectId}/fonts`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fonts: meta }) });
    if (!put.ok) { setBusy(false); setErr('Couldn’t add the typeface. A project holds up to eight.'); return; }
    const fd = new FormData(); fd.set('role', role); fd.set('licence', licence); files.forEach((f) => fd.append('files', f));
    const r = await fetch(`/api/projects/${projectId}/fonts`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr((j.problems || []).join(' ') || j.error || 'The upload didn’t work.'); return; }
    onDone(j.fonts, j.urls || {}, role);
  }
  return <div className="cf-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="cf" role="dialog" aria-modal="true" aria-labelledby="fd-t">
      <span className="cf-ic" aria-hidden><Upload size={18} strokeWidth={1.75} /></span>
      <h2 id="fd-t" className="cf-t">Upload a typeface</h2>
      <p className="cf-b">It’s added to this project’s Typefaces, so it can be used here, in the portal and in the kit.</p>
      <div className="fd-form">
        <label>Family name<input className="in" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tiempos Headline" /></label>
        <label>Used for<input className="in" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Pull quotes" /></label>
        <label className="fd-drop">{files.length ? `${files.length} file${files.length === 1 ? '' : 's'}: ${files.map((f) => f.name).join(', ')}` : 'Choose .woff2, .woff, .otf or .ttf files, one per weight'}<input type="file" multiple accept=".woff2,.woff,.otf,.ttf" onChange={(e) => setFiles([...(e.target.files || [])])} /></label>
        <div className="fd-lic" role="radiogroup" aria-label="Licence">{(['trial', 'licensed'] as const).map((l) => <button key={l} role="radio" aria-checked={licence === l} className={'btn' + (licence === l ? ' solid' : '')} onClick={() => setLicence(l)}>{l === 'trial' ? 'Trial files' : 'Licensed files'}</button>)}</div>
        {err ? <p className="fd-err" role="alert">{err}</p> : null}
      </div>
      <div className="cf-row"><button className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn solid" disabled={busy} onClick={go}>{busy ? 'Uploading…' : 'Upload and use'}</button></div>
    </div>
  </div>;
}

const HOME = '__home';
/** The portal's home page as the first item in the guidelines: the brand's line and the welcome, edited in place */
type HomeData = { client: string; line: string; intro: string; fallback: string; version?: string; title?: string; styles?: Record<string, TextStyle> };
function HomeEditor({ projectId, home, chapters, colours, fonts, onAddFont }: { projectId: string; home: HomeData; chapters: string[]; colours: { name: string; hex: string }[]; fonts: ToolbarFont[]; onAddFont: (then: (role: string) => void) => void }) {
  const [msg, setMsg] = useState('');
  const [sel, setSel] = useState<Sel | null>(null);
  const [styles, setStyles] = useState<Record<string, TextStyle>>(home.styles || {});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = async (patch: Record<string, unknown>) => {
    setMsg('Saving…');
    const r = await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    setMsg(r.ok ? 'Saved · shows on the portal straight away' : 'Couldn’t save. Check your connection.');
  };
  // The home page's title and welcome use the same text tools as everything else
  const setStyle = (field: string, st: TextStyle) => { const next = { ...styles, [field]: st }; setStyles(next); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => save({ content: { homeStyles: next } }), 500); };
  const fake: GuideChapter = { id: HOME, key: null, title: 'Home page', kicker: '', lede: '', rules: [], blocks: [], styles };
  const t = (k: string, cls: string) => { const p = textProps(styles[k]); return { className: [cls, p.className].filter(Boolean).join(' '), style: p.style, on: sel?.el === k, onFocus: () => setSel({ block: CHAPTER, el: k }) }; };
  return <div className="ve-main">
    {sel ? <Toolbar sel={sel} setSel={setSel} ch={fake} colours={colours} fonts={fonts} onAddFont={onAddFont} setChStyle={setStyle} setBlocks={() => {}} editBlock={() => {}} pickImage={() => {}} undo={() => {}} redo={() => {}} canUndo={false} canRedo={false} onDelete={() => {}} onReset={() => {}} />
      : <div className="tb" role="status"><span className="tb-ctx tb-empty" style={{ borderLeft: 0 }}><House size={15} strokeWidth={1.75} aria-hidden />Home page · {msg || 'Click the title or the welcome to edit it'}</span></div>}
    <div className="ve-canvas pt"><article className="pt-page ve-page hm-body">
      <header className="hm-head">
        <Editable value={home.title || home.client} tag="h1" {...t('title', 'pt-display')} placeholder={home.client} onSave={(v) => save({ content: { homeTitle: v.trim() && v.trim() !== home.client ? v.trim() : null } })} />
        <p className="mute hm-ver">Brand hub{home.version ? ` · v${home.version}` : ''}</p>
        <Editable value={home.intro} tag="p" {...t('lede', 'pt-lede hm-intro')} placeholder={home.fallback} multiline onSave={(v) => save({ content: { homeIntro: v.trim() || null } })} />
      </header>
      <div className="ve-homenext" aria-hidden>
        <p className="pt-h2">Chapters</p>
        <div className="ve-homechs">{chapters.slice(0, 6).map((c, i) => <span key={i}><i />{String(i + 1).padStart(2, '0')} {c}</span>)}</div>
        <p className="pt-h2">Recently used apps</p>
      </div>
    </article></div>
  </div>;
}

type RebuildMode = 'update' | 'add' | 'fresh';
type Found = { id: string; title: string; number?: string; frames: number; status: 'new' | 'imported'; importedAt?: string; edited?: boolean };
type FoundAll = { file?: string; page?: string; chapters: Found[]; showcase: number; showcaseImported: boolean };
const when = (d?: string) => { if (!d) return ''; const t = new Date(d); const days = Math.round((Date.now() - t.getTime()) / 864e5); return days < 1 ? 'today' : days === 1 ? 'yesterday' : days < 7 ? `${days} days ago` : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };

/** Import from Figma: first the chapters found in the guidelines file (pick the ones that are ready), then how to treat
 *  what's already here. Replacing asks a second time, since it overwrites the studio's work. */
function ImportDialog({ projectId, onClose, onRun }: { projectId: string; onClose: () => void; onRun: (m: RebuildMode, pick?: { chapters?: string[]; showcase?: boolean }) => void }) {
  const [found, setFound] = useState<FoundAll | null>(null);
  const [err, setErr] = useState('');
  const [on, setOn] = useState<Set<string>>(new Set());
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<RebuildMode>('update');
  const [sure, setSure] = useState(false);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }, [onClose]);
  useEffect(() => {
    fetch(`/api/projects/${projectId}/guide/chapters`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'Couldn’t read the Figma file.'); return; }
      setFound(j);
      // New chapters are ticked to start with; ones already here are left for you to choose
      const fresh = (j.chapters as Found[]).filter((c) => c.status === 'new');
      setOn(new Set((fresh.length ? fresh : j.chapters as Found[]).map((c) => c.id)));
      setShow(!!j.showcase && !j.showcaseImported);
    });
  }, [projectId]);
  const list = found?.chapters || [];
  const allOn = list.length > 0 && list.every((c) => on.has(c.id));
  const toggle = (id: string) => { const n = new Set(on); if (n.has(id)) n.delete(id); else n.add(id); setOn(n); };
  const chosen = list.filter((c) => on.has(c.id));
  const whole = allOn && (show || !found?.showcase);
  const run = () => onRun(mode, whole ? undefined : { chapters: chosen.map((c) => c.id), showcase: show });
  const nothing = !chosen.length && !show;
  const already = chosen.filter((c) => c.status === 'imported');
  const n = (x: number, w: string) => `${x} ${w}${x === 1 ? '' : 's'}`;
  const MODES: { mode: RebuildMode; icon: LucideIcon; title: string; body: string }[] = [
    { mode: 'update', icon: RefreshCw, title: 'Update, keep my edits', body: 'Brings in what changed in Figma. Edits, added sections and uploads made here are kept.' },
    { mode: 'add', icon: FilePlus2, title: 'Only add what’s new', body: 'Leaves chapters already here exactly as they are; only new chapters and sections come in.' },
    { mode: 'fresh', icon: TriangleAlert, title: whole ? 'Start over' : 'Replace these chapters', body: whole ? 'Rebuilds everything from Figma as if new. Edits, added chapters and the showcase are replaced.' : 'The chosen chapters are rebuilt from Figma as if new; edits made to them here are replaced. Other chapters aren’t touched.' }
  ];

  if (sure) return <div className="cf-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="cf" role="alertdialog" aria-modal="true" aria-labelledby="rb-t2" aria-describedby="rb-b2">
      <span className="cf-ic" aria-hidden><TriangleAlert size={18} strokeWidth={1.75} /></span>
      <h2 id="rb-t2" className="cf-t">{whole ? 'Start over from Figma?' : `Replace ${n(already.length, 'chapter')}?`}</h2>
      <p id="rb-b2" className="cf-b">{whole ? 'Every edit made in the platform to the guidelines and the showcase will be replaced by what’s in the Figma file. Typefaces, client accounts and files you uploaded stay. This can’t be undone.' : `Edits made here to ${already.map((c) => c.title).join(', ')} will be replaced by what’s in Figma.${chosen.length > already.length ? ` The ${n(chosen.length - already.length, 'new chapter')} will be brought in as well.` : ''} This can’t be undone.`}</p>
      <div className="cf-row"><button className="btn" autoFocus onClick={() => setSure(false)}>Go back</button><button className="btn solid cf-yes" onClick={run}>{whole ? 'Yes, start over' : 'Yes, replace them'}</button></div>
    </div>
  </div>;
  return <div className="cf-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="cf cf-wide im" role="dialog" aria-modal="true" aria-labelledby="rb-t">
      <h2 id="rb-t" className="cf-t">Import from Figma</h2>
      {err ? <><p className="cf-b" role="alert">{err}</p>{/link/i.test(err) ? <p className="cf-b"><a href="?tab=overview">Add the guidelines link on the Overview</a></p> : null}<div className="cf-row"><button className="btn" onClick={onClose}>Close</button></div></> : !found ? <><p className="cf-b" role="status">Looking for chapters in the guidelines file…</p><div className="im-load" aria-hidden><span /><span /><span /></div></> : <>
        <p className="cf-b">{found.file ? <>From <b>{found.file}</b>{found.page ? ` · ${found.page}` : ''}. </> : null}Choose the chapters that are ready; you can bring the rest in later.</p>
        {list.length ? <div className="im-list" role="group" aria-label="Chapters found in Figma">
          <label className="im-row im-all"><input type="checkbox" checked={allOn} onChange={() => setOn(allOn ? new Set() : new Set(list.map((c) => c.id)))} /><span className="im-t">All chapters</span><span className="im-meta">{n(list.length, 'chapter')} found</span></label>
          {list.map((c) => <label key={c.id} className={'im-row' + (on.has(c.id) ? ' on' : '')}>
            <input type="checkbox" checked={on.has(c.id)} onChange={() => toggle(c.id)} />
            <span className="im-t">{c.number ? <span className="im-num">{c.number}</span> : null}{c.title}</span>
            <span className="im-meta">{n(c.frames, 'frame')}</span>
            <span className={'im-tag ' + c.status}>{c.status === 'new' ? 'New' : `Imported ${when(c.importedAt) || 'earlier'}`}{c.edited ? ' · edited here' : ''}</span>
          </label>)}
          {found.showcase ? <label className={'im-row' + (show ? ' on' : '')}><input type="checkbox" checked={show} onChange={() => setShow(!show)} /><span className="im-t">Showcase</span><span className="im-meta">{n(found.showcase, 'row')}</span><span className={'im-tag ' + (found.showcaseImported ? 'imported' : 'new')}>{found.showcaseImported ? 'Imported' : 'New'}</span></label> : null}
        </div> : <p className="cf-b">No chapters found on that page. Chapters are the cards on the Guidelines page, or sections with frames in them (the layout library is skipped).</p>}
        {list.length ? <>
          <p className="im-h">Chapters already here</p>
          <div className="rb-opts" role="radiogroup" aria-label="Chapters already here">
            {MODES.map(({ mode: m, icon: Ic, title, body }) => <button key={m} role="radio" aria-checked={mode === m} className={'rb-opt' + (mode === m ? ' on' : '') + (m === 'fresh' ? ' warn' : '')} onClick={() => setMode(m)}>
              <span className="rb-ic" aria-hidden><Ic size={18} strokeWidth={1.75} /></span><span><b>{title}</b><span>{body}</span></span>
            </button>)}
          </div>
        </> : null}
        <div className="cf-row"><button className="btn" onClick={onClose}>Cancel</button>{list.length ? <button className="btn solid" disabled={nothing} onClick={() => (mode === 'fresh' && (whole || already.length) ? setSure(true) : run())}>{nothing ? 'Choose a chapter' : mode === 'fresh' && (whole || already.length) ? 'Continue' : whole ? 'Import everything' : `Import ${chosen.length ? n(chosen.length, 'chapter') : 'the showcase'}`}</button> : null}</div>
      </>}
    </div>
  </div>;
}

type Ask = { title: string; body: string; yes: string; run: () => void };
/** "Are you sure?" in the platform's own style; Enter confirms, Escape or a click outside cancels. */
function Confirm({ ask, onClose }: { ask: Ask; onClose: () => void }) {
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => { yes.current?.focus(); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }, [onClose]);
  return <div className="cf-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="cf" role="alertdialog" aria-modal="true" aria-labelledby="cf-t" aria-describedby="cf-b">
      <span className="cf-ic" aria-hidden><Trash2 size={18} strokeWidth={1.75} /></span>
      <h2 id="cf-t" className="cf-t">{ask.title}</h2>
      <p id="cf-b" className="cf-b">{ask.body}</p>
      <div className="cf-row"><button className="btn" onClick={onClose}>Cancel</button><button ref={yes} className="btn solid cf-yes" onClick={() => { ask.run(); onClose(); }}>{ask.yes}</button></div>
    </div>
  </div>;
}
