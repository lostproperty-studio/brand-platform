'use client';
import { createElement, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Block, BlockKind, BlockMedia, Guide, GuideChapter } from '@/lib/portal/guide';
import { blockText, itemEls, itemWords, ratioOf, unifyImages, type BlockItem, type BoxStyle, type FrameLook, type ItemEl, type TextStyle } from '@/lib/figma/blocks';
import { GuideBlock, textOn, type EditKit, type TextField } from '@/components/portal/GuideBlock';
import { Inspector } from '@/components/GuideInspector';
import { AddBar, addTarget, type AddWhat } from '@/components/GuideAddBar';
import { LayoutPicker, convertSection, layoutLabel, layoutOf, newSection } from '@/components/SectionLayouts';
import type { SectionLayout } from '@/lib/figma/blocks';
import { CHAPTER, Shortcuts, Toolbar, type Sel, type ToolbarFont } from '@/components/GuideDock';
import { SpaceCtl, StylesWindow } from '@/components/GuideStyles';
import { CreativeDirector } from '@/components/CreativeDirector';
import { IconPicker } from '@/components/IconPicker';
import { MultiPanel, type MultiItem } from '@/components/MultiPanel';
import { autoType } from '@/components/GuideInspector';
import { MakeDialog } from '@/components/MakeDialog';
import { guideMap, readSessions, type Ref as ReviewRef } from '@/lib/review/director';
import { CommentsPanel, useComments } from '@/components/CommentsPanel';
import type { PortalComment } from '@/lib/comments';
import { defaultSystem, spaceName, systemCss, systemFor, type GuideSystem, type TypeId } from '@/lib/guideSystem';
import { textProps } from '@/lib/textStyle';
import { fontFaceCss, type ProjectFont } from '@/lib/fonts';
import { ChevronDown, House, AlignLeft, Columns3, ExternalLink, Eye, EyeOff, GripVertical, Heading, GalleryHorizontal, UnfoldVertical, Image as ImageIcon, Images, LayoutGrid, PanelLeft, PanelTop, Palette, Plus, Quote, RefreshCw, FilePlus2, TriangleAlert, ScanSearch, Trash2, Upload, type LucideIcon } from 'lucide-react';
import { TimedProgress } from '@/components/Progress';
import { tierLabel, type Tier } from '@/lib/playbook';
import { ChapterCover } from '@/components/portal/ChapterCover';
import { coverKind } from '@/lib/portal/covers';
import { HistoryPanel, PeerLayer, Roundels, useCollab, type Incoming, type Me } from '@/components/Collab';
import { apply, compose, diff, isEmpty, type GuidePatch } from '@/lib/guidePatch';
import { History, MessageSquare } from 'lucide-react';
import { LayersPanel, type LayerAt, type LayerDrop } from '@/components/LayersPanel';
import { nodeFor } from '@/components/Collab';
import { useSpellCheck } from '@/components/SpellCheck';
import type { ChapterSuggestion } from '@/lib/portal/drafts';
import { Lightbulb, X } from 'lucide-react';

export const KINDS: [BlockKind, string][] = [['divider', 'Subsection headline'], ['text', 'Text'], ['columns', 'Auto layout'], ['grid', 'Grid'], ['statement', 'Statement'], ['split', 'Text + image'], ['image', 'Full-width image'], ['media', 'Images'], ['carousel', 'Carousel'], ['swatches', 'Colour swatches'], ['spacer', 'Spacer']];
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
const toHtml = (v: string | undefined, multiline: boolean) => (!v ? '' : multiline ? v.split(/\n+/).filter((p) => p.trim()).map((p) => `<p>${esc(p)}</p>`).join('') : esc(v).replace(/\n/g, '<br>'));
// innerText follows CSS case changes, so read it with them switched off; otherwise UPPERCASE styling would be saved into the words
const fromEl = (el: HTMLElement, multiline = false) => { el.classList.add('ed-raw'); const t = el.innerText; el.classList.remove('ed-raw'); return multiline ? t.split(/\n+/).map((x) => x.replace(/ /g, ' ').trim()).filter(Boolean).join('\n\n') : tidy(t); };
const tidy = (t: string) => t.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();

// Text you edit in place, in the brand's own type. Enter ends a headline; in body text, Enter starts a new paragraph.
function Editable({ value, onSave, tag, className, placeholder, multiline, style, onFocus, on }: { value?: string; onSave: (v: string) => void; tag: string; className: string; placeholder: string; multiline?: boolean; style?: React.CSSProperties; onFocus?: () => void; on?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { const el = ref.current; if (el && document.activeElement !== el) el.innerHTML = toHtml(value, !!multiline); }, [value, multiline]);
  return createElement(tag, {
    ref, className: className + ' ed' + (on ? ' ed-on' : ''), style, onFocus, contentEditable: true, suppressContentEditableWarning: true, 'data-ph': placeholder, spellCheck: false, role: 'textbox', 'aria-label': placeholder, 'aria-multiline': multiline || undefined,
    onBlur: () => { const el = ref.current; if (!el) return; const v = fromEl(el, !!multiline); if (v !== (value || '').trim()) onSave(v); if (!v) el.innerHTML = ''; },
    onPaste: (e: React.ClipboardEvent) => {
      e.preventDefault(); const t = e.clipboardData.getData('text/plain');
      // Pasted lines arrive as paragraphs in body text, so they get the same spacing as typed ones
      if (multiline && /\n/.test(t)) document.execCommand('insertHTML', false, t.split(/\r?\n+/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join(''));
      else document.execCommand('insertText', false, t);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') { (e.target as HTMLElement).innerHTML = toHtml(value, !!multiline); (e.target as HTMLElement).blur(); }
      if (e.key === 'Enter' && !multiline && !e.shiftKey) { e.preventDefault(); (e.target as HTMLElement).blur(); }
    }
  });
}

// The studio's guidelines editor: the client's view, editable in place.
const toolbarFonts = (fs: ProjectFont[]): ToolbarFont[] => fs.filter((f) => f.files.length).map((f) => ({ role: f.role, label: f.label, name: f.name, weights: [...new Set(f.files.map((x) => x.weight))].sort((a, b) => a - b) }));

/** A section's number among the ones the client sees, so deleting or hiding one never leaves a gap; hidden ones show a dash */
const secNo = (blocks: Block[], b: Block) => (b.hidden ? '–' : String(blocks.filter((x) => !x.hidden).indexOf(b) + 1).padStart(2, '0'));

/** Pictures in frames, everywhere, as frames filled with the picture */
const unify = (g: Guide | null): Guide | null => { if (!g) return g; let changed = false; const chapters = g.chapters.map((c) => { const blocks = c.blocks.map((b) => { const n = unifyImages(b); if (n !== b) changed = true; return n; }); return blocks.some((b, k) => b !== c.blocks[k]) ? { ...c, blocks } : c; }); return changed ? { ...g, chapters } : g; };

export function GuideEditor({ projectId, slug, guide: initial, content, thumbs, fontCss, fonts: initialFonts = [], tier, colours = [], logoUrl = null, home, me = null }: { me?: Me | null; home?: HomeData; projectId: string; slug: string; guide: Guide | null; content: Record<string, unknown>; thumbs: Record<string, string>; fontCss: string; fonts?: ProjectFont[]; tier?: Tier; colours?: { name: string; hex: string }[]; logoUrl?: string | null }) {
  // Typefaces: only those uploaded to the project. A new one uploaded from the toolbar is loaded straight away.
  const [fonts, setFonts] = useState(initialFonts);
  const [liveFontCss, setLiveFontCss] = useState('');
  const [fontAsk, setFontAsk] = useState<((role: string) => void) | null>(null);
  const router = useRouter();
  const [guide, setGuide] = useState(() => unify(initial));
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
  useEffect(() => { const next = unify(apply(initial, pending.current) || initial); setGuide(next); latest.current = next; setUrls((u) => ({ ...u, ...thumbs })); past.current = []; future.current = []; setHist(0); }, [initial, thumbs]);

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
    if (r.ok) collabRef.current?.reloadOthers();
    j0.current = j;
    setMsg(r.ok ? done + gapText(j.gaps) : 'The rebuild didn’t finish: ' + (j.error || r.status) + (/token|can’t find/i.test(j.error || '') ? '' : ' Try again in a minute; Figma is sometimes busy.'));
    router.refresh();
  }
  const gapText = (x?: { tier: string | null; drafts: number; missing: number; error?: string }) => !x ? (j0.current?.suggested ? ` ${j0.current.suggested} chapter${j0.current.suggested === 1 ? '' : 's'} added by an earlier version became suggestions.` : '') : x.error ? ' The tier check didn’t run: ' + x.error : !x.tier ? ' Set a tier on the Overview to have gaps drafted.' : ` ${x.drafts} draft section${x.drafts === 1 ? '' : 's'} and ${x.missing} missing item${x.missing === 1 ? '' : 's'} for the ${tierLabel(x.tier as Tier)} tier.`;
  const j0 = useRef<{ suggested?: number } | null>(null);
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
  // Saving: only what you changed is sent, and it's applied to the latest saved guide, so two people editing at once
  // never overwrite each other. Your changes also go straight to everyone else editing, live.
  const pending = useRef<GuidePatch | null>(null);
  const collabRef = useRef<ReturnType<typeof useCollab> | null>(null);
  const inflight = useRef(false);
  const urlsRef = useRef(urls); urlsRef.current = urls;
  const urlsFor = (p: GuidePatch) => { const s = JSON.stringify(p); return Object.fromEntries(Object.entries(urlsRef.current).filter(([k]) => s.includes(k))); };
  function save(next: Guide) {
    const patch = diff(latest.current, next);
    setGuide(next); latest.current = next;
    if (isEmpty(patch)) return;
    pending.current = compose(pending.current, patch);
    collabRef.current?.sendPatch(patch, urlsFor(patch));
    setMsg('Saving…'); later(600);
  }
  function later(ms: number) { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(flush, ms); }
  async function flush() {
    if (inflight.current) { later(300); return; }
    const p = pending.current; if (isEmpty(p)) return;
    pending.current = null; inflight.current = true;
    const r = await fetch(`/api/projects/${projectId}/guide/patch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patch: p }) }).catch(() => null);
    inflight.current = false;
    if (r?.ok) { setMsg(pending.current ? 'Saving…' : 'Saved · publish to show the client'); collabRef.current?.saved(); }
    else { pending.current = compose(p, pending.current); setMsg(r && r.status === 403 ? 'You can view these guidelines but not change them.' : 'Couldn’t save yet. Trying again…'); if (!r || r.status >= 409) later(3000); }
  }
  // Someone else's change: applied under yours, so anything you haven't saved yet stays as you left it.
  // Undo only ever undoes your own changes, so their change goes into your history too.
  function onRemote(x: Incoming) {
    if (x.urls && Object.keys(x.urls).length) setUrls((u) => ({ ...u, ...x.urls }));
    const next = apply(apply(latest.current, x.patch), pending.current);
    if (!next) return;
    latest.current = next; setGuide(next);
    past.current = past.current.map((g) => apply(g, x.patch) || g); future.current = future.current.map((g) => apply(g, x.patch) || g);
  }
  async function resync() {
    const r = await fetch(`/api/projects/${projectId}/guide/patch`).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    if (!j?.guide) return;
    const next = unify(apply(j.guide, pending.current) || j.guide);
    latest.current = next; setGuide(next); past.current = []; future.current = []; setHist((n) => n + 1);
    router.refresh();
  }
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (!isEmpty(pending.current) || inflight.current) { e.preventDefault(); e.returnValue = ''; } };
    const hide = () => { if (!isEmpty(pending.current) && !inflight.current) fetch(`/api/projects/${projectId}/guide/patch`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patch: pending.current }) }).then((r) => { if (r.ok) pending.current = null; }).catch(() => {}); };
    let away = 0;
    const vis = () => { if (document.visibilityState === 'hidden') { away = Date.now(); hide(); } else if (away && Date.now() - away > 30_000) resync(); };
    window.addEventListener('beforeunload', warn); window.addEventListener('pagehide', hide); document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('beforeunload', warn); window.removeEventListener('pagehide', hide); document.removeEventListener('visibilitychange', vis); };
  });
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
      if (ask || picker || keysOpen) return;
      // Esc while typing stops editing and keeps the text selected, as in Figma; Esc again selects its parent
      if (e.key === 'Escape' && t.isContentEditable) { e.preventDefault(); t.blur(); return; }
      const cmd = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
      const b = sel && ch ? ch.blocks.find((x) => x.id === sel.block) : undefined;
      // Figma's: Esc and ⇧Enter select the parent (text → frame → section), Enter selects inside
      if (!typing && (e.key === 'Escape' || (e.key === 'Enter' && e.shiftKey))) { if (!sel) return; e.preventDefault(); if (sel.el && sel.item !== undefined && sel.block !== CHAPTER) setSel({ block: sel.block, item: sel.item }); else if (sel.item !== undefined && b && ['columns', 'grid', 'carousel'].includes(b.kind)) setSel({ block: sel.block, el: 'items' }); else if (sel.el || sel.item !== undefined || sel.gap) setSel(sel.block === CHAPTER ? null : { block: sel.block }); else if (e.key === 'Escape') setSel(null); return; }
      if (!typing && e.key === 'Enter' && !cmd && b && sel && sel.item === undefined && (!sel.el || sel.el === 'items') && (b.items || []).length) { e.preventDefault(); setSel({ block: b.id, item: 0 }); return; }
      if ((e.key === 'Backspace' || e.key === 'Delete') && !typing && multi.length > 1) { e.preventDefault(); (document.querySelector('.dp .dp-act.danger') as HTMLButtonElement | null)?.click(); return; }
      if ((e.key === 'Backspace' || e.key === 'Delete') && !typing && sel) { e.preventDefault(); deleteSelection(); return; }
      if (e.key === 'Escape' && multi.length) { setMulti([]); return; }
      if (typing) return;
      if (!cmd && !e.altKey) {
        if (k === 'v' && !e.shiftKey) { setTool(null); return; }
        if (k === 't' && !e.shiftKey) { setTool('text'); setSpot(null); return; }
        if ((k === 'f' || k === 'a') && !e.shiftKey) { setTool('box'); setSpot(null); return; }
        if (e.key === '?') { setKeysOpen(true); return; }
      }
      if (!cmd) return;
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); step('undo'); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); step('redo'); }
      else if (k === 'k' && e.shiftKey) { e.preventDefault(); setTool('image'); }
      else if (k === 't' && e.altKey) { e.preventDefault(); setStylesOpen({}); }
      else if (!b || !ch) return;
      else if (k === 'd') { e.preventDefault(); const items = b.items || [];
        if (sel!.item !== undefined && !sel!.el && items[sel!.item]) { const n = sel!.item; editBlock(b.id, { items: [...items.slice(0, n + 1), { ...items[n], id: iid() }, ...items.slice(n + 1)] }); setSel({ block: b.id, item: n + 1 }); }
        else { const idx = ch.blocks.indexOf(b); const copy = { ...b, id: 'b-' + Math.random().toString(36).slice(2, 10), source: undefined, edited: true }; const l = [...ch.blocks]; l.splice(idx + 1, 0, copy); setBlocks(l); setSel({ block: copy.id }); } }
      else if (k === 'h' && e.shiftKey) { e.preventDefault(); editBlock(b.id, { hidden: !b.hidden }); }
      else if ((e.key === '[' || e.key === ']') && sel!.item !== undefined) { e.preventDefault(); const items = [...(b.items || [])]; const n = sel!.item; const to = Math.max(0, Math.min(items.length - 1, n + (e.key === ']' ? 1 : -1))); if (to === n) return; const [x] = items.splice(n, 1); items.splice(to, 0, x); editBlock(b.id, { items }); setSel({ ...sel!, item: to }); }
      else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); const l = [...ch.blocks]; const idx = l.indexOf(b); const to = Math.max(0, Math.min(l.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1))); if (to === idx) return; l.splice(idx, 1); l.splice(to, 0, b); setBlocks(l); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  const g = guide;
  // The guide's text styles and spacing: generated from the guidelines and typefaces, tuned in the Styles window
  const sysFrom = { typeScale: content.typeScale as never, profile: content.dsProfile as never, fonts: toolbarFonts(fonts) };
  const autoSys = defaultSystem(sysFrom);
  const sys = systemFor(g?.system, sysFrom);
  const setSysKey = (next: GuideSystem, key?: string) => { if (g) commit({ ...g, system: next.edited === false ? undefined : next }, key); };
  const [stylesOpen, setStylesOpen] = useState<{ focus?: TypeId } | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  // ---------- several things selected with shift; changes to what they share apply to all of them
  const [multi, setMulti] = useState<Sel[]>([]);
  const selKey = (x: Sel) => `${x.block}|${x.item ?? ''}|${x.el ?? ''}`;
  /** What a click lands on, as a selection: text, a frame (or what's in it), a part of a section, or the section */
  function selAt(t: HTMLElement): Sel | null {
    if (!ch) return null;
    if (t.closest('.ve-chhead')) return { block: CHAPTER, el: t.closest('.pt-display') ? 'title' : t.closest('.pt-lede') ? 'lede' : 'kicker' };
    const blockEl = t.closest('.ve-blocks [data-block]') as HTMLElement | null; const b = blockEl ? ch.blocks.find((x) => x.id === blockEl.dataset.block) : undefined; if (!b) return null;
    const box = t.closest('[data-item]') as HTMLElement | null;
    if (box && box.closest('.ve-block') === blockEl) { const i = Number(box.dataset.item); const it = (b.items || [])[i]; const node = t.closest('[data-el]') as HTMLElement | null;
      if (it && node && node.closest('[data-item]') === box && node.dataset.el && !node.dataset.el.startsWith('img')) return { block: b.id, item: i, el: `${it.id}.${node.dataset.el}` }; return { block: b.id, item: i }; }
    const part = t.closest('[data-part]') as HTMLElement | null; const pk = part?.dataset.part;
    if (pk === 'head') return { block: b.id, el: t.closest('.gb-eb') ? 'eyebrow' : 'heading' };
    if (pk === 'body') return { block: b.id, el: 'body' };
    if (pk?.startsWith('x-')) return { block: b.id, el: pk };
    return { block: b.id };
  }
  function shiftPick(e: React.MouseEvent) {
    if (!e.shiftKey) { if (multi.length) setMulti([]); return; }
    const t = selAt(e.target as HTMLElement); if (!t) return;
    e.preventDefault(); e.stopPropagation();
    const a0 = document.activeElement as HTMLElement | null; if (a0?.isContentEditable) a0.blur();
    const base = multi.length ? multi : sel ? [sel] : [];
    const k = selKey(t); const next = base.some((x) => selKey(x) === k) ? base.filter((x) => selKey(x) !== k) : [...base, t];
    setMulti(next.length > 1 ? next : []); setSel(next[next.length - 1] || null);
  }
  // Clicking empty space (the grey around the page, the gaps between sections, the margins) clears the selection
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (e.button !== 0 || e.shiftKey) return;
      const t = e.target as HTMLElement | null; if (!t?.closest) return;
      if (!t.closest('#pj-panel, .ve-grid')) return;
      if (t.closest('.ve-block, .dp, .ve-side, .ve-chset, [role="dialog"], [role="toolbar"], [role="menu"], .sh-wrap, .pl, .vh, button, input, select, textarea, a, label, [contenteditable="true"], .ve-top, .ve-dock, .ve-addbar, .ve-secs, .ve-hidden, .ve-removed')) return;
      const a0 = document.activeElement as HTMLElement | null; if (a0?.isContentEditable) a0.blur();
      setSel(null); setMulti([]);
    };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, []);
  // Outline everything in a multiple selection
  useEffect(() => {
    document.querySelectorAll('.ve-multi').forEach((x) => x.classList.remove('ve-multi'));
    for (const m of multi) {
      const bl = document.querySelector(`.ve-blocks [data-block="${m.block}"]`) as HTMLElement | null;
      const node = m.block === CHAPTER ? document.querySelector(`.ve-chhead ${m.el === 'title' ? '.pt-display' : m.el === 'lede' ? '.pt-lede' : '.mute'}`)
        : !bl ? null : m.item !== undefined ? (m.el ? bl.querySelector(`[data-item="${m.item}"] [data-el="${m.el.split('.')[1]}"]`) : bl.querySelector(`[data-item="${m.item}"]`))
        : m.el ? bl.querySelector(m.el === 'heading' ? '[data-part="head"] .gb-h, [data-part="head"] h2, [data-part="head"] h3' : m.el === 'eyebrow' ? '.gb-eb' : `[data-part="${m.el}"]`) : bl;
      node?.classList.add('ve-multi');
    }
  });
  // Icons: where the next one goes (a frame, at an index), or which icon it replaces
  // Make with Krea: where the result goes, and the dialog
  const [makeFor, setMakeFor] = useState<{ block: string; target: string; aspect?: string } | null>(null);
  async function make(prompt: string, kind: 'image' | 'video'): Promise<string | null> {
    const t = makeFor; if (!t) return null;
    const r = await fetch(`/api/projects/${projectId}/guide/make`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, kind, aspect: t.aspect }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return j.error || 'Krea couldn’t make that just now.';
    setUrls((u) => ({ ...u, [j.path]: j.url }));
    const [w, h] = (t.aspect || '4:3').split(':').map(Number);
    putMedia({ block: t.block, target: t.target }, { path: j.path, w: (w || 4) * 400, h: (h || 3) * 400, kind: 'photo', ...(kind === 'video' ? { video: true } : {}) });
    setMakeFor(null); return null;
  }
  const [iconAt, setIconAt] = useState<{ block: string; item: number; index?: number; replace?: string } | null>(null);
  const putIcon = (icon: { set: string; name: string; svg: string }) => {
    const at = iconAt; setIconAt(null); if (!at || !ch) return;
    const b = ch.blocks.find((x) => x.id === at.block); const items = b?.items || []; const it = items[at.item]; if (!b || !it) return;
    if (at.replace) { editBlock(b.id, { items: items.map((x, n) => (n !== at.item ? x : { ...x, els: (x.els || []).map((e) => (e.id === at.replace ? { ...e, icon } : e)) })) }); return; }
    const { els, styles } = materialise(it, b.styles || {});
    const ne: ItemEl = { id: 'e-' + uid(), kind: 'icon', icon, size: 32 };
    els.splice(Math.min(at.index ?? els.length, els.length), 0, ne);
    editBlock(b.id, { items: items.map((x, n) => (n === at.item ? { ...x, els, label: undefined, heading: undefined, body: undefined, media: undefined } : x)), styles });
    setSel({ block: b.id, item: at.item, el: `${it.id}.${ne.id}` });
  };
  const [reviewCount, setReviewCount] = useState(0);
  // The creative director's notes point at text by id: jump to it, or apply a fix to it
  const reviewGoTo = (r: ReviewRef) => {
    setChId(r.chapter);
    if (!r.block) setSel({ block: CHAPTER, el: r.field });
    else { const c0 = latest.current?.chapters.find((c) => c.id === r.chapter); const b0 = c0?.blocks.find((x) => x.id === r.block); const ii = r.item ? (b0?.items || []).findIndex((x) => x.id === r.item) : -1;
      setSel(ii >= 0 ? { block: r.block, item: ii, el: `${r.item}.${r.field}` } : r.field.startsWith('cap:') ? { block: r.block, el: 'img:' + r.field.slice(4) } : { block: r.block, el: r.field }); }
    setTimeout(() => { const el = r.block ? document.querySelector(`[data-block="${r.block}"]`) : document.querySelector('.ve-chhead'); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 80);
  };
  /** What Review should help with: the selected text, frame or section, as references to its words */
  const reviewFocus = () => {
    if (!g || !sel || !chId) return null;
    const refs = Object.entries(guideMap(g, chId).refs);
    const blk = ch?.blocks.find((x) => x.id === sel.block); const it = sel.item !== undefined ? blk?.items?.[sel.item] : undefined;
    const elId = sel.el?.includes('.') ? sel.el.split('.')[1] : sel.el;
    const pick = (f: (r: ReviewRef) => boolean) => refs.filter(([, r]) => f(r)).map(([k]) => k);
    if (sel.block === CHAPTER) return sel.el ? { label: sel.el === 'title' ? 'The chapter title' : sel.el === 'lede' ? 'The introduction' : 'The chapter label', refs: pick((r) => !r.block && r.field === sel.el) } : null;
    if (it && elId && sel.el?.includes('.')) return { label: `This text in frame ${sel.item! + 1}`, refs: pick((r) => r.block === sel.block && r.item === it.id && r.field === elId) };
    if (it) return { label: `Frame ${sel.item! + 1}`, refs: pick((r) => r.block === sel.block && r.item === it.id) };
    if (sel.el && !sel.el.startsWith('img')) return { label: sel.el === 'heading' ? 'This headline' : sel.el === 'eyebrow' ? 'This label' : 'This text', refs: pick((r) => r.block === sel.block && r.field === sel.el) };
    return { label: `This section${blk?.heading ? ` · ${blk.heading.slice(0, 24)}` : ''}`, refs: pick((r) => r.block === sel.block) };
  };
  const reviewApply = (r: ReviewRef, quote: string, sug: string): boolean => reviewRewrite(r, (t) => (t.includes(quote) ? t.replace(quote, sug) : null));
  /** Change one piece of text the review points at: f gets the text and returns the new text, or null for no change */
  const reviewRewrite = (r: ReviewRef, f: (t: string) => string | null): boolean => {
    const g0 = latest.current; if (!g0) return false;
    const c0 = g0.chapters.find((c) => c.id === r.chapter); if (!c0) return false;
    const rep = (t?: string) => { if (!t) return null; const v = f(t); return v === null || v === t ? null : v; };
    let next: GuideChapter | null = null;
    if (!r.block) { const v = rep((c0 as unknown as Record<string, string>)[r.field]); if (v === null) return false; next = { ...c0, [r.field]: v, edited: true }; }
    else {
      const b0 = c0.blocks.find((x) => x.id === r.block); if (!b0) return false;
      let patch: Partial<Block> | null = null;
      if (r.item) { const it = (b0.items || []).find((x) => x.id === r.item); if (!it) return false;
        if (it.els) { const e = it.els.find((x) => x.id === r.field); const v = rep(e?.text); if (v === null) return false; patch = { items: (b0.items || []).map((x) => (x.id === it.id ? { ...x, els: (x.els || []).map((y) => (y.id === r.field ? { ...y, text: v } : y)) } : x)) }; }
        else { const v = rep((it as unknown as Record<string, string>)[r.field]); if (v === null) return false; patch = { items: (b0.items || []).map((x) => (x.id === it.id ? { ...x, [r.field]: v } : x)) }; } }
      else if (r.field.startsWith('x-')) { const x0 = (b0.extras || []).find((x) => 'x-' + x.id === r.field); const v = rep(x0?.text); if (v === null) return false; patch = { extras: (b0.extras || []).map((x) => ('x-' + x.id === r.field ? { ...x, text: v } : x)) }; }
      else if (r.field.startsWith('cap:')) { const k = Number(r.field.slice(4)); const v = rep((b0.media || [])[k]?.caption); if (v === null) return false; patch = { media: (b0.media || []).map((m, n) => (n === k ? { ...m, caption: v } : m)) }; }
      else { const v = rep((b0 as unknown as Record<string, string>)[r.field]); if (v === null) return false; patch = { [r.field]: v } as Partial<Block>; }
      next = { ...c0, blocks: c0.blocks.map((x) => (x.id === b0.id ? { ...x, ...patch, edited: true } : x)) };
    }
    commit({ ...g0, chapters: g0.chapters.map((c) => (c.id === c0.id ? next! : c)) });
    return true;
  };
  // Each section is shown at the portal's real width (1120px with its margins, so 1024px of content), zoomed out
  // as a whole when the editor is narrower, so what you see is what the client sees, just smaller
  const fitObs = useRef<ResizeObserver | null>(null);
  const fitPage = useCallback((el: HTMLDivElement | null) => {
    fitObs.current?.disconnect(); fitObs.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const fit = () => { const w = el.clientWidth; el.style.setProperty('--ve-z', String(w ? Math.min(1, w / PAGE_W) : 1)); };
    fitObs.current = new ResizeObserver(fit); fitObs.current.observe(el); fit();
  }, []);
  const ch = g?.chapters.find((c) => c.id === chId);
  // Working together: who's here, where, their cursors, and their edits as they make them
  const collab = useCollab({ projectId, me, ch: chId, sel, onPatch: onRemote, onReload: () => router.refresh(), onResync: resync });
  collabRef.current = collab;
  const [historyOpen, setHistoryOpen] = useState(false);
  // Comments the studio left on the portal preview
  const comments = useComments(projectId);
  const [commentsOpen, setCommentsOpen] = useState<false | { only: string | null }>(false);
  // Live spell check (British English). The brand's own words count as spelt right: its name, typefaces, colours,
  // its vocabulary from the voice, and anything added to the guide's dictionary.
  const known = useMemo(() => [slug, ...(g?.dictionary || []), ...fonts.map((f) => f.name || ''), ...colours.map((c) => c.name),
    ...((((content as { voice?: { fields?: Record<string, string> } } | undefined)?.voice?.fields) || {}).vocabulary || '').split(/[\n,]/)].filter(Boolean), [slug, g?.dictionary, fonts, colours, content]);
  const spell = useSpellCheck({ root: '.ve-blocks, .ve-chhead', known, onAdd: (w) => { const g0 = latest.current; if (g0) commit({ ...g0, dictionary: [...new Set([...(g0.dictionary || []), w])] }); } });
  // Chapters the tier calls for that aren't in the guidelines: suggestions only, added when the studio says so
  const [suggs, setSuggs] = useState<ChapterSuggestion[]>(((content as { chapterSuggestions?: ChapterSuggestion[] } | undefined)?.chapterSuggestions) || []);
  useEffect(() => { setSuggs(((content as { chapterSuggestions?: ChapterSuggestion[] } | undefined)?.chapterSuggestions) || []); }, [content]);
  async function settleSuggestion(sg: ChapterSuggestion, take: boolean) {
    const rest = suggs.filter((x) => x.slot !== sg.slot); setSuggs(rest);
    if (take && g) { const c: GuideChapter = { id: `draft-${sg.slot}`, key: null, slot: sg.slot, title: sg.title, kicker: '', lede: '', blocks: sg.blocks, rules: [], edited: true }; setChapters([...g.chapters.filter((x) => x.id !== c.id), c]); setChId(c.id); setSel(null); }
    const dismissed = ((content as { dismissedSlots?: string[] } | undefined)?.dismissedSlots) || [];
    await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { chapterSuggestions: rest, ...(take ? {} : { dismissedSlots: [...new Set([...dismissed, sg.slot])] }) } }) }).catch(() => {});
  }
  // Panel number fields select their value when you click in, so typing replaces it straight away, as in Figma
  useEffect(() => {
    const pick = (e: FocusEvent) => { const t = e.target as HTMLInputElement; if (t?.matches?.(':is(.dp, .sw, .fk) input:is([type=number], [type=text], :not([type]))')) requestAnimationFrame(() => { try { t.select(); } catch { /* not selectable */ } }); };
    document.addEventListener('focusin', pick);
    return () => document.removeEventListener('focusin', pick);
  }, []);
  useEffect(() => {
    const move = (e: MouseEvent) => { if ((e.target as HTMLElement).closest?.('.ve-main')) collab.moveCursor(e); };
    const out = (e: MouseEvent) => { if (!(e.relatedTarget as HTMLElement | null)?.closest?.('.ve-main') && (e.target as HTMLElement).closest?.('.ve-main')) collab.moveCursor(null); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseout', out);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseout', out); };
  }, [collab.moveCursor]);
  function goTo(p: { ch?: string; sel?: Sel | null }) {
    if (p.ch) { setChId(p.ch); setSel(null); }
    setTimeout(() => { const n = p.sel ? document.querySelector(`.ve-blocks [data-block="${p.sel.block}"]`) : null; n?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120);
  }
  const setChapters = (chapters: GuideChapter[], key?: string) => g && commit({ ...g, chapters }, key);
  const setCh = (patch: Partial<GuideChapter>, key?: string) => g && setChapters(g.chapters.map((c) => (c.id === chId ? { ...c, ...patch } : c)), key);
  const setBlocks = (blocks: Block[], key?: string) => setCh({ blocks }, key);
  const editBlock = (id: string, patch: Partial<Block>, key?: string) => ch && setBlocks(ch.blocks.map((b) => (b.id === id ? { ...b, ...patch, edited: true } : b)), key && `${id}:${key}`);
  // A section in a layout (like a slide layout): headline, introduction, then the layout's content
  // Add from Figma: a layout from the project's Figma guidelines, imported as a new section right here
  const figmaPick = {
    load: async () => { const r = await fetch(`/api/projects/${projectId}/guide/figma-layouts`); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Couldn’t read the Figma file.'); return j; },
    pick: async (frameId: string) => {
      const at = picker && 'at' in picker ? picker.at : null;
      const r = await fetch(`/api/projects/${projectId}/guide/figma-layouts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frameId }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Couldn’t import that layout.');
      if (!ch || at === null) return;
      const b = unifyImages(j.block as Block) as Block;
      setUrls((u) => ({ ...u, ...(j.urls || {}) }));
      const l = [...ch.blocks]; l.splice(at, 0, b); setBlocks(l); setPicker(null); setSel({ block: b.id });
      setTimeout(() => document.querySelector(`[data-block="${b.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    }
  };
  const insertLayout = (i: number, layout: SectionLayout) => {
    if (!ch) return;
    const b = { id: 'b-' + uid(), media: [], edited: true, ...newSection(layout) } as Block;
    const l = [...ch.blocks]; l.splice(i, 0, b); setBlocks(l); setPicker(null); setSel({ block: b.id });
    setTimeout(() => document.querySelector(`[data-block="${b.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    return b;
  };
  const changeLayout = (id: string, layout: SectionLayout) => { const b = ch?.blocks.find((x) => x.id === id); if (b) editBlock(id, { ...convertSection(b, layout), edited: true }); setPicker(null); };
  const insertAt = (i: number, kind: BlockKind) => {
    if (!ch) return;
    setPicker(null);
    const items = kind === 'carousel' ? [1, 2, 3].map((n) => ({ id: iid(), label: String(n).padStart(2, '0'), heading: 'A headline for this card', body: 'A sentence or two to go with it.' })) : kind === 'columns' ? [1, 2, 3].map(() => ({ id: iid(), label: 'Label', body: 'Text' })) : kind === 'grid' ? [[4, 4], [2, 2], [2, 2], [3, 2], [3, 2]].map(([w, h]) => ({ id: iid(), label: 'Label', body: 'Text', w, h })) : undefined;
    const b: Block = { id: 'b-' + uid(), kind, heading: kind === 'swatches' ? 'Colours' : kind === 'divider' ? 'New subsection' : kind === 'statement' ? 'A statement in the brand’s voice' : kind === 'image' || kind === 'columns' || kind === 'grid' ? undefined : 'New section', body: kind === 'text' || kind === 'split' ? 'Write something…' : '', media: [], swatches: kind === 'swatches' ? [{ name: 'Colour', hex: '#000000' }] : undefined, cols: kind === 'media' ? 2 : kind === 'columns' ? 3 : undefined, side: kind === 'split' ? 'right' : undefined, items, box: kind === 'carousel' ? 'fill' : items ? 'none' : undefined, variant: kind === 'carousel' ? 'cards' : undefined, ...(kind === 'spacer' ? { heading: undefined, body: '', size: 64 } : {}), edited: true };
    const l = [...ch.blocks]; l.splice(i, 0, b); setBlocks(l); setMenu(null); setSel({ block: b.id });
    return b;
  };
  // ---------- placing with the adding bar: pick a tool, the cursor becomes a cross, click where it goes
  type Spot = { mode: 'line' | 'box'; block?: string; item?: number; index?: number; part?: number; parts?: string[]; label: string; line: { top: number; left: number; width: number; height: number } };
  const [picker, setPicker] = useState<{ at: number } | { convert: string } | null>(null);
  const [tool, setTool] = useState<AddWhat | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  useEffect(() => { document.body.classList.toggle('ve-tool', !!tool); return () => document.body.classList.remove('ve-tool'); }, [tool]);
  const WHAT: Record<AddWhat, string> = { headline: 'Headline', text: 'Text', label: 'Label', image: 'Image', box: 'Frame', swatch: 'Colour', spacer: 'Spacer', icon: 'Icon' };
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
    // Text anywhere in a section (not inside a box): it lands between the section's parts, on its grid
    if (!box && blockEl && (tool === 'text' || tool === 'headline' || tool === 'label')) {
      const parts = [...blockEl.querySelectorAll('[data-part]')].filter((x) => x.closest('[data-block]') === blockEl) as HTMLElement[];
      if (parts.length) {
        const index = parts.filter((x) => { const q = x.getBoundingClientRect(); return q.top + q.height / 2 < e.clientY; }).length;
        const r0 = parts[0].parentElement!.getBoundingClientRect();
        const y = index === 0 ? parts[0].getBoundingClientRect().top - 8 : index >= parts.length ? parts[parts.length - 1].getBoundingClientRect().bottom + 8 : (parts[index - 1].getBoundingClientRect().bottom + parts[index].getBoundingClientRect().top) / 2;
        const after = index > 0 ? parts[index - 1].dataset.part : undefined;
        const name = (p?: string) => (p === 'head' ? 'the headline' : p === 'body' ? 'the introduction' : p === 'items' ? 'the frames' : p === 'media' ? 'the images' : 'this text');
        return { mode: 'line', block: blockEl.dataset.block, part: index, parts: parts.map((x) => x.dataset.part!), label: `${WHAT[tool]} ${index === 0 ? 'at the top' : `under ${name(after)}`}`, line: { top: y - 1, left: r0.left, width: r0.width, height: 2 } };
      }
    }
    if (box && blockEl && tool === 'box') { const r = box.getBoundingClientRect(); return { mode: 'box', block: blockEl.dataset.block, item: Number(box.dataset.item), label: 'Frame inside this one', line: { top: r.top, left: r.left, width: r.width, height: r.height } }; }
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
  /** Pick up a frame, or anything in one, and move it, as in Figma: press and drag a few pixels. A click without
   *  moving still selects (and a click on text still edits it). Text being edited selects text instead. */
  function armMove(e: React.PointerEvent, b: Block) {
    if (e.button !== 0 || tool) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, input, select, textarea, label, a, .ve-hd, .ve-ins, .ve-pgap, .ve-grip-el, .ve-grip-box, .ve-grip-part, .ve-handle-tab, .ve-pgap-pop, .ve-slide-label, .ve-draft')) return;
    const ed = t.closest('[contenteditable="true"]') as HTMLElement | null;
    if (ed && document.activeElement === ed) return;
    const blockEl = e.currentTarget as HTMLElement;
    const box = t.closest('[data-item]') as HTMLElement | null;
    const inThis = (x: HTMLElement | null) => !!x && x.closest('.ve-block') === blockEl;
    let go: (ev: PointerEvent) => void;
    if (box && inThis(box) && ['columns', 'grid', 'carousel'].includes(b.kind)) {
      // A frame, or something inside one
      const node = t.closest('[data-el]') as HTMLElement | null;
      const inBox = !!node && node.closest('[data-item]') === box && !!node.dataset.el && !node.dataset.el.startsWith('img');
      const item = Number(box.dataset.item);
      go = (ev) => (inBox ? startMove(ev, 'el', b.id, item, node!.dataset.el, node!) : startMove(ev, 'box', b.id, item, undefined, box));
    } else {
      // A part of the section (headline, text, images, added text), or else the whole section
      const part = t.closest('[data-part]') as HTMLElement | null;
      const sibs = part?.parentElement ? [...part.parentElement.children].filter((x) => (x as HTMLElement).dataset.part) : [];
      if (part && inThis(part) && sibs.length > 1) go = (ev) => startMove(ev, 'part', b.id, -1, part.dataset.part, part);
      else go = (ev) => startMove(ev, 'section', b.id, -1, undefined, blockEl);
    }
    const x0 = e.clientX, y0 = e.clientY;
    const mv = (ev: PointerEvent) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; off(); go(ev); };
    const off = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', off); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', off);
  }
  /** Drag a side of a frame to size it, as in Figma: the width or height becomes fixed; pushed to the edge of the
   *  frame it's in, it becomes Fill. Works for frames inside frames and for frames in an auto layout. */
  function sizeFrame(e: React.PointerEvent, side: 'n' | 's' | 'e' | 'w', node: HTMLElement, parent: HTMLElement, apply: (p: { sw?: 'fill' | number; sh?: 'fill' | number }) => void) {
    e.preventDefault(); e.stopPropagation();
    const r0 = node.getBoundingClientRect(); const x0 = e.clientX, y0 = e.clientY; let last: { sw?: 'fill' | number; sh?: 'fill' | number } = {};
    // The canvas may be zoomed out to show the page at its real width: measure on screen, store real pixels
    const z = zoomOf(node); const css = (v: number) => Math.round(v / z);
    const pr = () => { const r = parent.getBoundingClientRect(); const cs = getComputedStyle(parent); return { l: r.left + parseFloat(cs.paddingLeft), r: r.right - parseFloat(cs.paddingRight), t: r.top + parseFloat(cs.paddingTop), b: r.bottom - parseFloat(cs.paddingBottom) }; };
    document.body.classList.add('ve-sizing');
    // The parent's edges as they were when you started: a parent that hugs grows with the frame, so measuring it live
    // would always find the frame at its edge and snap to Fill. Hold Alt to drag without snapping.
    const p0 = pr();
    // Proportions locked: dragging the height moves the width with it, so the shape holds
    const ar = (() => { const v = getComputedStyle(node).aspectRatio; if (!v || v === 'auto') return 0; const [a, b] = v.replace('auto', '').split('/').map((x) => parseFloat(x)); return a && b ? a / b : a || 0; })();
    const move = (ev: PointerEvent) => {
      const p = pr(); const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (side === 'e' || side === 'w') {
        const w = Math.max(24, Math.round(r0.width + (side === 'e' ? dx : -dx)));
        const edge = !ev.altKey && (Math.abs(side === 'e' ? r0.left + w - p.r : r0.right - w - p.l) <= 10 || (side === 'e' ? r0.left + w > p.r : r0.right - w < p.l));
        last = { sw: edge ? 'fill' : css(w) }; node.style.width = last.sw === 'fill' ? '100%' : `${css(w)}px`; node.style.flex = last.sw === 'fill' ? '' : '0 0 auto';
      } else if (ar) {
        const h = Math.max(24, r0.height + (side === 's' ? dy : -dy)); const w = Math.max(24, Math.round(h * ar));
        last = { sw: css(w) }; node.style.width = `${css(w)}px`; node.style.flex = '0 0 auto';
      } else {
        const h = Math.max(24, Math.round(r0.height + (side === 's' ? dy : -dy)));
        // Height snaps to Fill only at the edge; dragged further, the frame grows and its parent with it
        const edge = !ev.altKey && Math.abs(side === 's' ? r0.top + h - p0.b : r0.bottom - h - p0.t) <= 6;
        last = { sh: edge ? 'fill' : css(h) }; node.style.height = `${css(h)}px`; node.style.aspectRatio = 'auto';
      }
      node.dataset.size = last.sw !== undefined ? (last.sw === 'fill' ? 'Fill' : `W ${last.sw}`) : last.sh === 'fill' ? 'Fill' : `H ${last.sh}`;
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('ve-sizing'); node.style.width = ''; node.style.height = ''; node.style.flex = ''; node.style.aspectRatio = ''; delete node.dataset.size; if (last.sw !== undefined || last.sh !== undefined) apply(last); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }
  // ---------- drag to move: an element within or between boxes, or a box among its neighbours. Snaps into place.
  type Drag = { kind: 'el' | 'box' | 'part' | 'section'; block: string; item: number; el?: string; order?: string[]; label: string; x: number; y: number; target?: { block: string; item: number; index: number }; line?: { top: number; left: number; width: number; height: number } };
  const [moving, setMoving] = useState<Drag | null>(null);
  function startMove(e: React.PointerEvent | PointerEvent, kind: 'el' | 'box' | 'part' | 'section', blockId: string, item: number, el?: string, from?: HTMLElement) {
    e.preventDefault(); e.stopPropagation();
    const a0 = document.activeElement as HTMLElement | null; if (a0?.isContentEditable) a0.blur();
    window.getSelection()?.removeAllRanges();
    const src = from || (e.currentTarget as HTMLElement).closest(kind === 'el' ? '[data-el]' : kind === 'part' ? '[data-part]' : kind === 'section' ? '[data-block]' : '[data-item]') as HTMLElement | null;
    // Parts move among their siblings: headline, text, images and boxes within the section
    const siblings = kind === 'part' && src?.parentElement ? ([...src.parentElement.children] as HTMLElement[]).filter((x) => x.dataset.part) : [];
    const PART: Record<string, string> = { head: 'Headline', body: 'Text', media: 'Images', items: 'Frames' };
    const label = kind === 'section' ? 'Section' : kind === 'part' ? PART[el || ''] || (src?.innerText || 'Text').trim().slice(0, 40) : kind === 'box' ? 'Frame' : (src?.innerText || 'Image').trim().slice(0, 40) || 'Image';
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
      } else if (kind === 'section') {
        // Sections: between slides, by height
        const slides = ([...document.querySelectorAll('.ve-blocks [data-block]')] as HTMLElement[]);
        const others = slides.filter((x) => x.dataset.block !== blockId);
        if (others.length) {
          const index = others.filter((x) => { const q = x.getBoundingClientRect(); return q.top + q.height / 2 < ev.clientY; }).length;
          const r0 = others[0].getBoundingClientRect();
          const y = index === 0 ? r0.top - 14 : others[index - 1].getBoundingClientRect().bottom + 14;
          target = { block: blockId, item: -1, index }; line = { top: y - 1, left: r0.left, width: r0.width, height: 3 };
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
    if (d.kind === 'section') {
      // Index among the other visible sections, mapped back to the chapter's list
      const shown = c.blocks.filter((x) => x.id !== d.block && (!x.hidden || showHidden));
      const moved = c.blocks.find((x) => x.id === d.block); if (!moved) return;
      const before = shown[d.target.index];
      const rest = c.blocks.filter((x) => x.id !== d.block);
      const at = before ? rest.indexOf(before) : rest.length;
      const next = [...rest.slice(0, at), moved, ...rest.slice(at)];
      if (next.map((x) => x.id).join() === c.blocks.map((x) => x.id).join()) return;
      commit({ ...cur, chapters: cur.chapters.map((x) => (x.id !== chId ? x : { ...x, blocks: next })) });
      return;
    }
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
    if (sp.part !== undefined && sp.parts && (what === 'text' || what === 'headline' || what === 'label')) {
      const id = uid(); const kind = what === 'headline' ? 'heading' : what;
      const order = [...sp.parts]; order.splice(sp.part, 0, 'x-' + id);
      editBlock(b.id, { extras: [...(b.extras || []), { id, kind, text: kind === 'heading' ? 'Headline' : kind === 'label' ? 'Label' : 'Write something…' }], order });
      setSel({ block: b.id, el: 'x-' + id }); focusNext.current = true; return;
    }
    if (sp.item === undefined) { add(what, { block: b.id }); return; }
    if (what === 'icon') { setIconAt({ block: b.id, item: sp.item, index: sp.index }); return; }
    // Into the box, at the point clicked. Its fixed fields become a free list of elements the first time.
    const items = b.items || []; const it = items[sp.item]; if (!it) return;
    const { els, styles } = materialise(it, b.styles || {});
    // Figma's way: a frame (F) or an image dropped into a frame becomes a frame inside it; an image is a frame filled with it
    const kind: ItemEl['kind'] = what === 'headline' ? 'heading' : what === 'text' ? 'text' : what === 'label' ? 'label' : what === 'spacer' ? 'spacer' : 'frame';
    const ne: ItemEl = { id: 'e-' + uid(), kind, ...(kind === 'frame' ? { look: what === 'image' ? { ratio: '4:3' } : { ratio: '16:9', fill: { type: 'colour' as const, colour: '#EEEEEE' } } } : kind === 'spacer' ? { size: 32 } : { text: kind === 'heading' ? 'Headline' : kind === 'label' ? 'Label' : 'Write something…' }) };
    els.splice(Math.min(sp.index ?? els.length, els.length), 0, ne);
    editBlock(b.id, { items: items.map((x, n) => (n === sp.item ? { ...x, els, label: undefined, heading: undefined, body: undefined, media: undefined } : x)), styles });
    if (kind === 'frame') { setSel({ block: b.id, item: sp.item, el: `${it.id}.${ne.id}` }); if (what === 'image') pickImage(b.id, `look:${sp.item}:${ne.id}`); }
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
        if (target?.kind === 'spacer' || target?.kind === 'frame' || target?.kind === 'icon') return;
        kind = target ? (target.kind === 'image' ? 'text' : target.kind) : KIND[field] || 'text'; current = target?.text || '';
        box = els.filter((e) => e.kind !== 'image' && e.kind !== 'spacer' && e.kind !== 'frame' && e.kind !== 'icon').map((e) => ({ kind: e.kind, text: e.text || '', target: e.id === field }));
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
    if (sel.el?.startsWith('x-')) { const id = sel.el.slice(2); editBlock(b.id, { extras: (b.extras || []).filter((x) => x.id !== id), order: (b.order || []).filter((p) => p !== sel.el) }); setSel({ block: b.id }); return; }
    if (sel.gap) { const { [sel.gap]: _g, ...rest } = b.gapBefore || {}; void _g; editBlock(b.id, { gapBefore: rest }); setSel({ block: b.id }); return; }
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
  /** A frame inside a frame (at the end): filled with an image when asked, else a light colour to change */
  function nestFrame(b: Block, k: number, image: boolean) {
    const items = b.items || []; const it = items[k]; if (!it) return;
    const { els, styles } = materialise(it, b.styles || {});
    const ne: ItemEl = { id: 'e-' + uid(), kind: 'frame', look: image ? { ratio: '4:3' } : { ratio: '16:9', fill: { type: 'colour', colour: '#EEEEEE' } } };
    els.push(ne);
    editBlock(b.id, { items: items.map((x, n) => (n === k ? { ...x, els, label: undefined, heading: undefined, body: undefined, media: undefined } : x)), styles });
    setSel({ block: b.id, item: k, el: `${it.id}.${ne.id}` });
    if (image) pickImage(b.id, `look:${k}:${ne.id}`);
  }
  // ── Layers: select (shift adds), hide, rename and move frames and what's in them
  function layerSelect(s: Sel, shift: boolean) {
    const a0 = document.activeElement as HTMLElement | null; if (a0?.isContentEditable) a0.blur();
    if (!shift) { setMulti([]); setSel(s); return; }
    const base = multi.length ? multi : sel ? [sel] : [];
    const k = selKey(s); const next = base.some((x) => selKey(x) === k) ? base.filter((x) => selKey(x) !== k) : [...base, s];
    setMulti(next.length > 1 ? next : []); setSel(next[next.length - 1] || null);
  }
  const CLEAR = { label: undefined, heading: undefined, body: undefined, media: undefined };
  function layerPatch(b: Block, at: LayerAt, patch: Partial<ItemEl>) {
    const items = b.items || []; const it = items[at.i]; if (!it) return;
    if (at.el === undefined) { editBlock(b.id, { items: items.map((x, n) => (n === at.i ? { ...x, ...patch } as BlockItem : x)) }); return; }
    const { els, styles, ids } = materialise(it, b.styles || {}); const id = ids[at.el] || at.el;
    editBlock(b.id, { items: items.map((x, n) => (n === at.i ? { ...x, els: els.map((e) => (e.id === id ? { ...e, ...patch } : e)), ...CLEAR } : x)), styles });
    if (ids[at.el] && sel?.el === `${it.id}.${at.el}`) setSel({ ...sel, el: `${it.id}.${id}` });
  }
  function layerMove(b: Block, from: LayerAt, to: LayerDrop) {
    const items = [...(b.items || [])];
    if (from.el === undefined) {
      if (to.el !== undefined) return;
      const [it] = items.splice(from.i, 1); let at = to.i + (to.pos === 'after' ? 1 : 0); if (from.i < at) at--;
      items.splice(at, 0, it); editBlock(b.id, { items }); setMulti([]); setSel({ block: b.id, item: at }); return;
    }
    const src = items[from.i], dst0 = items[to.i]; if (!src || !dst0) return;
    let styles = b.styles || {};
    const m1 = materialise(src, styles); styles = m1.styles;
    const mid = m1.ids[from.el] || from.el;
    const k = m1.els.findIndex((e) => e.id === mid); if (k < 0) return;
    const [moving] = m1.els.splice(k, 1);
    items[from.i] = { ...src, els: m1.els, ...CLEAR };
    let dstEls = m1.els, tids = m1.ids;
    if (to.i !== from.i) {
      const m2 = materialise(dst0, styles); styles = m2.styles; dstEls = m2.els; tids = m2.ids;
      const ok = `${src.id}.${mid}`; if (styles[ok]) { const { [ok]: st0, ...rest } = styles; styles = { ...rest, [`${dst0.id}.${mid}`]: st0 }; }
    }
    if (to.el === undefined || to.pos === 'inside') dstEls.push(moving);
    else { const tid = tids[to.el] || to.el; const j = dstEls.findIndex((e) => e.id === tid); dstEls.splice(j < 0 ? dstEls.length : j + (to.pos === 'after' ? 1 : 0), 0, moving); }
    items[to.i] = { ...items[to.i], els: dstEls, ...CLEAR };
    editBlock(b.id, { items, styles }); setMulti([]); setSel({ block: b.id, item: to.i, el: `${items[to.i].id}.${mid}` });
  }
  // Hidden layers stay in the editor, faded
  useEffect(() => {
    document.querySelectorAll('.ve-hid').forEach((x) => x.classList.remove('ve-hid'));
    for (const b of ch?.blocks || []) (b.items || []).forEach((it, i) => {
      if (it.hidden) nodeFor({ block: b.id, item: i })?.classList.add('ve-hid');
      for (const e of it.els || []) if (e.hidden) nodeFor({ block: b.id, item: i, el: `${it.id}.${e.id}` })?.classList.add('ve-hid');
    });
  });
  const layerBlock = (() => { const s = multi.length ? multi[multi.length - 1] : sel; return s && s.block !== CHAPTER ? ch?.blocks.find((x) => x.id === s.block) : undefined; })();

  function add(what: AddWhat, at?: Sel | null) {
    if (!ch) return;
    const sel = at === undefined ? selRef : at;
    const b = sel ? ch.blocks.find((x) => x.id === sel.block) : undefined;
    const itemish = !!b && ['columns', 'grid', 'carousel'].includes(b.kind) && b.variant !== 'images';
    const items = b?.items || [];
    const newBox = (p: Partial<BlockItem>) => { if (!b) return; const i = sel?.item !== undefined ? sel.item + 1 : items.length; const it = { id: iid(), w: b.kind === 'grid' ? 2 : 1, h: 2, ...p }; editBlock(b.id, { items: [...items.slice(0, i), it, ...items.slice(i)] }); return { i, it }; };
    const afterSection = (kind: BlockKind, then?: (nb: Block) => void) => { const nb = addSection(kind, sel); if (nb && then) then(nb); };
    if (!b && what === 'icon') { afterSection('columns', (nb) => setIconAt({ block: nb.id, item: 0 })); return; }
    if (!b) { // nothing selected: a new section at the end
      const kind: BlockKind = what === 'headline' ? 'divider' : what === 'image' ? 'image' : what === 'box' ? 'columns' : what === 'swatch' ? 'swatches' : what === 'spacer' ? 'spacer' : 'text';
      afterSection(kind, (nb) => { if (what === 'image') pickImage(nb.id, 'new'); });
      return;
    }
    if (what === 'spacer') { afterSection('spacer'); return; }
    if (what === 'swatch') { if (b.kind === 'swatches') editBlock(b.id, { swatches: [...(b.swatches || []), { name: 'Colour', hex: '#000000' }] }); else afterSection('swatches'); return; }
    if (what === 'box' && itemish && sel?.item !== undefined && items[sel.item]) { nestFrame(b, sel.item, false); return; }
    if (what === 'icon') { if (itemish && sel?.item !== undefined && items[sel.item]) setIconAt({ block: b.id, item: sel.item }); else if (itemish) { const r = newBox({}); if (r) setIconAt({ block: b.id, item: r.i }); } else setMsg('Icons go inside a frame: pick a frame, or use the icon tool on one.'); return; }
    if (what === 'box') { if (itemish) { const r = newBox(b.kind === 'carousel' ? { label: String(items.length + 1).padStart(2, '0'), heading: 'A headline for this card', body: 'A sentence or two to go with it.' } : { label: 'Label', body: 'Text' }); if (r) setSel({ block: b.id, item: r.i }); } else afterSection('columns'); return; }
    // Inside a selected box
    const it = sel?.item !== undefined && itemish ? items[sel.item] : undefined;
    if (it && sel?.item !== undefined) {
      const field = what === 'headline' ? 'heading' : what === 'label' ? 'label' : 'body';
      if (what === 'image') { nestFrame(b, sel.item, true); return; }
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
    const isVideo = file.type.startsWith('video/');
    const dims = isVideo ? await new Promise<{ w: number; h: number }>((ok) => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => ok({ w: v.videoWidth || 1920, h: v.videoHeight || 1080 }); v.onerror = () => ok({ w: 1920, h: 1080 }); v.src = URL.createObjectURL(file); })
      : await new Promise<{ w: number; h: number }>((ok) => { const im = new Image(); im.onload = () => ok({ w: im.naturalWidth || 1200, h: im.naturalHeight || 800 }); im.onerror = () => ok({ w: 1200, h: 800 }); im.src = URL.createObjectURL(file); });
    if (isVideo && file.size > 40 * 1024 * 1024) { setMsg('Videos must be under 40 MB. Export a shorter or smaller loop.'); return null; }
    setMsg('Uploading…');
    // Big photos are made smaller here first (up to 3200px on the long side), so they're never refused for size
    if (!isVideo && /^image\/(png|jpeg|webp)$/.test(file.type) && (file.size > 3.5 * 1024 * 1024 || Math.max(dims.w, dims.h) > 4000)) {
      const small = await shrink(file, dims).catch(() => null);
      if (small) { file = small.file; dims.w = small.w; dims.h = small.h; }
    }
    if (!isVideo && file.size > 4 * 1024 * 1024) { setMsg('That image is over 4 MB and couldn’t be made smaller. Try a JPG or a smaller export.'); return null; }
    const fd = new FormData(); fd.set('file', file);
    const r = await fetch(`/api/projects/${projectId}/guide/upload`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'The upload didn’t go through. Try again.'); return null; }
    setUrls((u) => ({ ...u, [j.path]: j.url })); setMsg('');
    return { path: j.path, w: dims.w, h: dims.h, kind: file.type === 'image/svg+xml' ? 'graphic' : 'photo', ...(isVideo ? { video: true } : {}) };
  }
  useEffect(() => { if (!msg || msg === 'Uploading…' || /couldn|didn|must|over \d|failed|Drop an|Try again|error/i.test(msg)) return; const t = setTimeout(() => setMsg(''), 2600); return () => clearTimeout(t); }, [msg]);
  /** Where a file dropped on the page goes: the picture, frame or box under the pointer */
  function dropTarget(el: HTMLElement | null): { block: string; target: number | string; node: HTMLElement } | null {
    const blockEl = el?.closest('[data-block]') as HTMLElement | null; if (!el || !blockEl?.dataset.block) return null;
    const pic = el.closest('[data-drop]') as HTMLElement | null;
    if (pic) { const v = pic.dataset.drop!; return { block: blockEl.dataset.block, target: /^\d+$/.test(v) ? Number(v) : v, node: pic }; }
    const box = el.closest('[data-item]') as HTMLElement | null; if (!box) return null;
    const fr = el.closest('.gi-frame-el[data-el]') as HTMLElement | null;
    if (fr && box.contains(fr)) return { block: blockEl.dataset.block, target: `look:${box.dataset.item}:${fr.dataset.el}`, node: fr };
    return { block: blockEl.dataset.block, target: `ilook:${box.dataset.item}`, node: box };
  }
  const dropOn = useRef<HTMLElement | null>(null);
  const markDrop = (n: HTMLElement | null) => { if (dropOn.current === n) return; dropOn.current?.classList.remove('ve-dropon'); n?.classList.add('ve-dropon'); dropOn.current = n; };
  const fileDrag = {
    onDragOver: (e: React.DragEvent) => { if (!e.dataTransfer.types.includes('Files')) return; const t = dropTarget(e.target as HTMLElement); markDrop(t?.node || null); if (t) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } },
    onDragLeave: (e: React.DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) markDrop(null); },
    onDrop: async (e: React.DragEvent) => {
      const f = e.dataTransfer.files?.[0]; const t = dropTarget(e.target as HTMLElement); markDrop(null);
      if (!f || !t) return; e.preventDefault();
      if (!/^(image|video)\//.test(f.type)) { setMsg('Drop an image (PNG, JPG, WebP, SVG or GIF) or a video (MP4 or WebM).'); return; }
      const up = await upload(f); if (up) putMedia({ block: t.block, target: t.target }, up);
    }
  };
  function pickImage(block: string, target: number | 'backdrop' | 'new' | 'thumb' | string) { fileFor.current = { block, target }; fileInput.current?.click(); }
  async function onFile(f?: File) {
    const t = fileFor.current; if (!f || !t || !ch) return;
    const up = await upload(f); if (!up) return;
    putMedia(t, up);
  }
  /** Puts an uploaded or made picture where it was asked for */
  function putMedia(t: { block: string; target: number | 'backdrop' | 'new' | 'thumb' | string }, up: BlockMedia) {
    if (!ch) return;
    if (t.target === 'thumb') { setCh({ thumb: up.path }); return; }
    const b = ch.blocks.find((x) => x.id === t.block); if (!b) return;
    // A fill for a frame: a nested frame (look:k:el) or the frame itself (ilook:k)
    if (typeof t.target === 'string' && (t.target.startsWith('look:') || t.target.startsWith('ilook:'))) {
      const [kind, k, elId] = t.target.split(':'); const fill = { type: up.video ? 'video' as const : 'image' as const, media: up };
      // The frame takes the picture's own proportions, so nothing is cropped; a set height gives way to them
      const shape = (l?: FrameLook): FrameLook => { const r = ratioOf(up.w, up.h); return { ...(l || {}), fill, ...(r ? { ratio: r, fit: 'fill' as const, ...(typeof l?.sh === 'number' ? { sh: undefined } : {}) } : {}) }; };
      editBlock(b.id, { items: (b.items || []).map((x, n) => (n !== Number(k) ? x : kind === 'ilook' ? { ...x, look: shape(x.look) } : { ...x, els: (x.els || itemEls(x)).map((e) => (e.id === elId ? { ...e, look: shape(e.look) } : e)) })) });
      return;
    }
    if (typeof t.target === 'string' && t.target.startsWith('itemel:')) { const [, k, elId] = t.target.split(':'); editBlock(b.id, { items: (b.items || []).map((x, n) => (n === Number(k) ? { ...x, els: (x.els || []).map((e) => (e.id === elId ? { ...e, media: up } : e)) } : x)) }); return; }
    if (typeof t.target === 'string' && t.target.startsWith('item:')) { const k = Number(t.target.slice(5)); editBlock(b.id, { items: (b.items || []).map((x, n) => (n === k ? { ...x, media: up } : x)) }); return; }
    if (t.target === 'backdrop') editBlock(b.id, { backdrop: up });
    else if (t.target === 'new') editBlock(b.id, { media: [...(b.media || []), up] });
    else editBlock(b.id, { media: (b.media || []).map((m, i) => (i === t.target ? { ...up, caption: m.caption, ...(m.look ? { look: { ...m.look, ratio: ratioOf(up.w, up.h) } } : {}) } : m)) });
  }

  if (!g) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
      <p className="mute" style={{ margin: 0 }}>Reads the Figma page and rebuilds every slide as live web content. Then edit it here exactly as the client will see it.</p>
      <div className="row"><button className="btn solid" disabled={busy} onClick={() => rebuild('fresh')}>Build guidelines from Figma</button><span className="mute">{msg}</span></div>
      <TimedProgress label="Reading Figma and rebuilding every slide" expected={90} running={busy} />
    </div>
  );

  const openComments = comments.list.filter((c) => !c.resolved_at).length;
  const commentWhere = (c: PortalComment) => {
    const chc = g.chapters.find((x) => x.id === c.chapter); const blk = chc?.blocks.find((x) => x.id === c.block);
    if (!chc) return c.path === '/' ? 'Portal home' : c.path.replace(/^\//, '').replace(/\//g, ' › ').replace(/-/g, ' ');
    return [chc.title, blk ? (blk.heading || blk.eyebrow || layoutLabel(blk)).replace(/\s+/g, ' ').slice(0, 40) : null].filter(Boolean).join(' › ');
  };
  const jumpToComment = (c: PortalComment) => {
    if (c.chapter && g.chapters.some((x) => x.id === c.chapter) && c.chapter !== chId) setChId(c.chapter);
    if (c.block) { setSel({ block: c.block }); setTimeout(() => document.querySelector(`.ve-blocks [data-block="${CSS.escape(c.block!)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); }
  };
  const kitFor = (b: Block): EditKit => ({
    text: (field: TextField, value, el) => (!value ? null : <Editable key={field} value={value} tag={el.tag} className={el.className} placeholder={el.placeholder} multiline={el.multiline} style={el.style} on={sel?.block === b.id && sel.el === field} onFocus={() => setSel({ block: b.id, el: field })} onSave={(v) => editBlock(b.id, { [field]: v || undefined } as Partial<Block>)} />),
    image: (target, _m, imgEl) => <span data-drop={String(target)} className={'ve-img' + (sel?.block === b.id && sel.el === `img:${target}` ? ' on' : '')} onMouseDown={(e) => { e.stopPropagation(); setSel({ block: b.id, el: `img:${target}` }); }}>{imgEl}</span>,
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
    insertItem: (at, edge) => <button key={'ins-' + edge} type="button" className={'ve-ins ' + edge} aria-label={edge === 'after' ? 'Add a frame at the end' : `Add a frame before frame ${at + 1}`} data-tip="Add frame" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); const items = [...(b.items || [])]; const nb = items[at] || items[at - 1]; items.splice(at, 0, { id: iid(), label: nb?.label !== undefined ? 'Label' : undefined, heading: nb?.heading ? 'A headline' : undefined, body: nb?.body || !nb ? 'Text' : undefined, w: b.kind === 'grid' ? (nb?.w || 2) : 1, h: nb?.h || 2 }); editBlock(b.id, { items, ...(b.kind === 'columns' && b.flow?.dir !== 'col' ? { cols: Math.min(6, items.length) } : {}) }); setSel({ block: b.id, item: at }); }}><span><Plus size={12} strokeWidth={2} aria-hidden /></span></button>,
    selectEl: (i, key) => setSel({ block: b.id, item: i, el: key }), isSel: (key) => sel?.block === b.id && sel.el === key,
    sizeEl: (i, elId, side, ev) => { const node = (ev.currentTarget as HTMLElement).closest('.fr') as HTMLElement; const parent = node.closest('[data-item]') as HTMLElement; if (!node || !parent) return;
      sizeFrame(ev, side, node, parent, (p) => { const cur = latest.current?.chapters.find((c) => c.id === chId)?.blocks.find((x) => x.id === b.id); const it = cur?.items?.[i]; if (!cur || !it) return;
        editBlock(b.id, { items: (cur.items || []).map((x, n) => (n !== i ? x : { ...x, els: (x.els || []).map((y) => (y.id === elId ? { ...y, look: { ...(y.look || {}), ...p, ...(p.sw !== undefined ? { swPct: undefined } : {}), ...(p.sh !== undefined ? { ratio: undefined } : {}) } } : y)) })) }); }); },
    addItem: () => null, // frames are added with the + between frames, the panel or F; never a tile
    // The selected box: an outline and handles to drag its width (and height, in a grid) across the columns
    extraText: (x, el) => <Editable key={el.key} value={x.text} tag={el.tag} className={el.className} placeholder={el.placeholder} multiline={el.multiline} style={el.style} on={sel?.block === b.id && sel.el === `x-${x.id}`} onFocus={() => setSel({ block: b.id, el: `x-${x.id}` })} onSave={(v) => editBlock(b.id, v ? { extras: (b.extras || []).map((y) => (y.id === x.id ? { ...y, text: v } : y)) } : { extras: (b.extras || []).filter((y) => y.id !== x.id), order: (b.order || []).filter((p) => p !== `x-${x.id}`) })} />,
    gap: (part, value, rule) => { const on = sel?.block === b.id && sel.gap === part;
      const setOwn = (px: number | undefined) => { const g0 = { ...(b.gapBefore || {}) }; if (px === undefined) delete g0[part]; else g0[part] = px; editBlock(b.id, { gapBefore: g0 }, 'gap-' + part); };
      const shown = value ?? (rule ? sys.space[rule] : undefined);
      return <div key={'gap-' + part} className={'ve-pgap' + (on ? ' on' : '')} style={{ ['--g' as string]: value !== undefined ? `${value}px` : rule ? `var(--sp-${rule}, var(--part-gap, 20px))` : 'var(--part-gap, 20px)' }} onMouseDown={(e) => { e.stopPropagation(); if (!on) setSel({ block: b.id, gap: part }); }} title="Space between these: click to adjust">
        <span className="ve-pgap-v">{shown !== undefined ? spaceName(shown) : 'Auto'}{value !== undefined ? ' · only here' : ''}</span>
        {on && rule ? <span className="ve-pgap-pop" onMouseDown={(e) => e.stopPropagation()} role="group" aria-label="Space between">
          <SpaceCtl sys={sys} rule={rule} own={value} setRule={(px) => setSysKey({ ...sys, edited: true, space: { ...sys.space, [rule]: px } }, 'sp:' + rule)} setOwn={setOwn} label="Space" />
        </span> : null}
      </div>; },
    partGrip: (part) => <span className="ve-grip-el ve-grip-part" onPointerDown={(e) => startMove(e, 'part', b.id, -1, part)} title="Drag to move" aria-hidden><GripVertical size={14} strokeWidth={2} /></span>,
    grip: (i, elId) => ['columns', 'grid', 'carousel'].includes(b.kind) ? <span className="ve-grip-el" onPointerDown={(e) => startMove(e, 'el', b.id, i, elId)} title="Drag to move" aria-hidden><GripVertical size={14} strokeWidth={2} /></span> : null,
    itemBar: (i) => sel?.block === b.id && sel.item === i ? <>
      <span className="ve-itemsel" aria-hidden />
      <span className="ve-grip-box" onPointerDown={(e) => startMove(e, 'box', b.id, i)} title="Drag to move this box" aria-hidden><GripVertical size={12} strokeWidth={2} />Frame</span>
      {b.kind === 'columns' ? (['n', 's', 'e', 'w'] as const).map((sd) => <span key={sd} className={'ve-fh ve-fh-' + sd} onPointerDown={(e) => { const node = (e.currentTarget as HTMLElement).closest('[data-item]') as HTMLElement; const parent = node?.parentElement as HTMLElement; if (!node || !parent) return;
        sizeFrame(e, sd, node, parent, (p) => { const cur = latest.current?.chapters.find((c) => c.id === chId)?.blocks.find((x) => x.id === b.id); if (!cur) return; editBlock(b.id, { items: (cur.items || []).map((x, n) => (n !== i ? x : { ...x, look: { ...(x.look || {}), ...p } })) }); }); }} aria-hidden />) : null}
      {b.kind === 'grid' ? <span className="ve-hd ve-hd-r" onPointerDown={(e) => startResize(e, b, i, 'x')} role="slider" aria-label="Drag to change width" aria-valuenow={b.items?.[i]?.w || 1} title="Drag to change width" /> : null}
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
    const zz = zoomOf(box);
    const gap = (parseFloat(cs.columnGap) || 0) * zz, rgap = (parseFloat(cs.rowGap) || 0) * zz;
    const colW = (rect.width - gap * (n - 1)) / n;
    const rowH = grid ? (parseFloat(cs.gridAutoRows.split(' ').pop() || '64') || 64) * zz : 0;
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
      {msg ? <div className={'ve-toast' + (/couldn|didn|must|over \d|failed|Drop an|Try again|error/i.test(msg) ? ' warn' : '')} role="status">{msg === 'Uploading…' ? <span className="ve-toast-spin" aria-hidden /> : null}{msg}{msg !== 'Uploading…' ? <button type="button" onClick={() => setMsg('')} aria-label="Dismiss">×</button> : null}</div> : null}
      <input ref={fileInput} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="ve-top">
        <button className="btn solid ic" disabled={busy} onClick={() => setRebuildOpen(true)} aria-haspopup="dialog"><RefreshCw size={15} strokeWidth={1.75} aria-hidden />Import from Figma</button>
        <a className="btn ic" href={`/p/${slug}/guidelines`} target="_blank" rel="noopener"><ExternalLink size={15} strokeWidth={1.75} aria-hidden />Preview as client</a>
        <button className={'btn ic' + (showHidden ? ' solid' : '')} aria-pressed={showHidden} onClick={() => setShowHidden(!showHidden)}>{showHidden ? <Eye size={15} strokeWidth={1.75} aria-hidden /> : <EyeOff size={15} strokeWidth={1.75} aria-hidden />}{showHidden ? 'Showing hidden' : 'Show hidden'}{hiddenCount ? ` (${hiddenCount})` : ''}</button>
        <span className="ve-tier">{tier ? `${tierLabel(tier)} tier` : 'No tier set'}{nDraft || nMissing ? ` · ${[nDraft ? `${nDraft} draft${nDraft === 1 ? '' : 's'} to check` : '', nMissing ? `${nMissing} missing` : ''].filter(Boolean).join(' · ')}` : ''}</span>
        {tier ? <button className="btn ic" disabled={busy} onClick={checkGaps}><ScanSearch size={15} strokeWidth={1.75} aria-hidden />Check for gaps</button> : <a className="btn" href="?tab=overview">Set a tier</a>}
        <div className="ve-who">
          <button type="button" className="btn ic" onClick={() => { setCommentsOpen(commentsOpen ? false : { only: null }); setHistoryOpen(false); }} aria-pressed={!!commentsOpen}><MessageSquare size={15} strokeWidth={1.75} aria-hidden />Comments{openComments ? <i className="cm-n">{openComments}</i> : null}</button>
          <button type="button" className="btn ic" onClick={() => { setHistoryOpen(!historyOpen); setCommentsOpen(false); }} aria-pressed={historyOpen}><History size={15} strokeWidth={1.75} aria-hidden />History</button>
          <span className={'ve-live ' + collab.status} data-tip={collab.status === 'live' ? 'Live: you see everyone’s edits as they happen' : collab.status === 'off' ? 'Not live right now. Your edits still save, and you’ll catch up when it reconnects.' : 'Connecting…'} />
          <Roundels me={me} peers={collab.peers} chapters={g.chapters} go={goTo} />
        </div>
      </div>
      <PeerLayer peers={collab.peers} cursors={collab.cursors} ch={chId} />
      {spell.menu}
      {commentsOpen ? <CommentsPanel comments={comments} slug={slug} only={commentsOpen.only} onClose={() => setCommentsOpen(false)} where={commentWhere} onJump={jumpToComment} /> : null}
      {historyOpen ? <HistoryPanel projectId={projectId} onClose={() => setHistoryOpen(false)} onRestored={(gd) => { const next = gd as Guide; pending.current = null; latest.current = next; setGuide(next); past.current = []; future.current = []; setHist((n) => n + 1); setMsg('Restored. Everyone editing now sees this version.'); collab.reloadOthers(); router.refresh(); }} /> : null}
      {(g.version || 1) < 2 ? <div className="card" role="status" style={{ borderColor: '#000' }}><p style={{ margin: 0 }}>These guidelines were built with an older version, so some pages may still show slide images.</p><p className="mute" style={{ margin: '4px 0 8px' }}>Rebuild to get live text, colour swatches you can click to copy, and subsections. Your edits are kept.</p><button className="btn solid" disabled={busy} onClick={() => setRebuildOpen(true)}>Rebuild now</button></div> : null}
      <TimedProgress label="Reading Figma and rebuilding every slide" expected={Math.max(45, g.chapters.reduce((n, c) => n + c.blocks.length, 0) * 2)} running={busy} />

      <div className="ve-grid">
        <aside className="ve-side">
        <nav className="ve-chs" aria-label="Chapters">
          {home ? <div className={'ve-ch ve-home' + (chId === HOME ? ' on' : '')}><button onClick={() => { setChId(HOME); setSel(null); }}><House size={14} strokeWidth={1.75} aria-hidden />Home page</button></div> : null}
          <p className="ve-label">Chapters · drag to reorder</p>
          {g.chapters.filter((c) => !c.removed).map((c, i) => <div key={c.id} draggable onDragStart={() => setDrag({ kind: 'chapter', id: c.id })} onDragOver={(e) => { if (drag?.kind === 'chapter') { e.preventDefault(); setOver(c.id); } }} onDrop={() => { if (drag?.kind === 'chapter') moveChapter(drag.id, c.id); setDrag(null); setOver(null); }} onDragEnd={() => { setDrag(null); setOver(null); }}
            className={'ve-ch' + (c.id === chId ? ' on' : '') + (c.hidden ? ' off' : '') + (over === c.id && drag?.kind === 'chapter' ? ' over' : '')}>
            <span className="ve-grip" aria-hidden><GripVertical size={14} strokeWidth={1.75} /></span>
            <button onClick={() => { setChId(c.id); setSel(null); }}><span className="pt-n">{String(i + 1).padStart(2, '0')}</span><span className="ve-ch-t" title={c.title}>{c.title}</span>{[...new Map(collab.peers.filter((p) => p.ch === c.id && p.id !== me?.id).map((p) => [p.id, p])).values()].map((p) => <span key={p.id} className="ve-ch-who" style={{ background: p.color }} title={`${p.name} is here`} />)}{chDrafts(c) ? <span className="ve-dcount" title="Drafts and missing items to check">{chDrafts(c)}</span> : null}</button>
            <button className={'ve-eye' + (c.hidden ? ' on' : '')} onClick={() => setChapters(g.chapters.map((x) => (x.id === c.id ? { ...x, hidden: !x.hidden } : x)))} aria-label={c.hidden ? `Show ${c.title} to the client` : `Hide ${c.title} from the client`} data-tip={c.hidden ? 'Hidden. Show it' : 'Hide from the client'}>{c.hidden ? <EyeOff size={14} strokeWidth={1.75} aria-hidden /> : <Eye size={14} strokeWidth={1.75} aria-hidden />}</button>
            <button className="ve-eye ve-del" onClick={() => deleteChapter(c)} aria-label={`Delete ${c.title}`} data-tip="Delete chapter"><Trash2 size={14} strokeWidth={1.75} aria-hidden /></button>
          </div>).flatMap((row, i) => { const c = g.chapters.filter((x) => !x.removed)[i];
            // The open chapter's sections, like a slide sorter: click to go to one, drag to reorder
            return c.id !== chId ? [row] : [row, <ol key={c.id + '-s'} className="ve-secs" aria-label={`Sections in ${c.title}`}>{c.blocks.map((b, k) => (b.hidden && !showHidden ? null : <li key={b.id} draggable onDragStart={() => setDrag({ kind: 'block', id: b.id })} onDragOver={(e) => { if (drag?.kind === 'block') { e.preventDefault(); setOver(b.id); } }} onDrop={() => { if (drag?.kind === 'block') moveBlock(drag.id, b.id); setDrag(null); setOver(null); }} onDragEnd={() => { setDrag(null); setOver(null); }} className={(sel?.block === b.id ? 'on' : '') + (over === b.id && drag?.kind === 'block' ? ' over' : '') + (b.hidden ? ' off' : '')}>
              <button onClick={() => { setSel({ block: b.id }); document.querySelector(`[data-block="${b.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}><span className="n">{secNo(c.blocks, b)}</span><span className="t">{(b.heading || b.eyebrow || layoutLabel(b)).replace(/\s+/g, ' ').slice(0, 48)}</span></button>
            </li>))}<li className="ve-secs-add"><button onClick={() => setPicker({ at: c.blocks.length })}><Plus size={12} strokeWidth={2} aria-hidden />Section</button></li></ol>]; })}
          {suggs.length ? <div className="ve-suggs" aria-label="Suggested chapters">
            <p className="ve-label"><Lightbulb size={11} strokeWidth={2} aria-hidden /> Suggested for the tier</p>
            {suggs.map((sg) => <div key={sg.slot} className="ve-sugg" title={sg.note || undefined}>
              <span className="ve-sugg-t">{sg.title}</span>
              <button className="ve-linkbtn" onClick={() => settleSuggestion(sg, true)} aria-label={`Add ${sg.title} as a chapter`}>Add</button>
              <button className="ve-eye" onClick={() => settleSuggestion(sg, false)} aria-label={`Dismiss ${sg.title}`} data-tip="Dismiss"><X size={13} strokeWidth={1.75} aria-hidden /></button>
            </div>)}
          </div> : null}
          {g.chapters.some((c) => c.removed) ? <div className="ve-removed"><button className="ve-linkbtn" onClick={() => setShowRemoved(!showRemoved)} aria-expanded={showRemoved}>Deleted chapters ({g.chapters.filter((c) => c.removed).length})</button>
            {showRemoved ? g.chapters.filter((c) => c.removed).map((c) => <div key={c.id} className="ve-removed-row"><span>{c.title}</span><button className="ve-linkbtn" onClick={() => setChapters(g.chapters.map((x) => (x.id === c.id ? { ...x, removed: false } : x)))}>Restore</button></div>) : null}</div> : null}
          <button className="btn ic" style={{ marginTop: 8 }} onClick={() => { const c: GuideChapter = { id: 'custom-' + uid(), key: null, title: 'New chapter', kicker: '', lede: '', edited: true, blocks: [], rules: [] }; setChapters([...g.chapters, c]); setChId(c.id); setSel(null); }}><Plus size={15} strokeWidth={1.75} aria-hidden />Chapter</button>
        </nav>
        {ch ? <LayersPanel block={layerBlock} title={layerBlock ? layoutLabel(layerBlock) : ''} sel={sel} multi={multi}
          select={layerSelect} hide={(at, hidden) => layerBlock && layerPatch(layerBlock, at, { hidden: hidden || undefined })} rename={(at, name) => layerBlock && layerPatch(layerBlock, at, { name: name || undefined })} move={(f, t) => layerBlock && layerMove(layerBlock, f, t)} /> : null}
        </aside>

        {chId === HOME && home ? <HomeEditor projectId={projectId} home={home} colours={colours} fonts={toolbarFonts(fonts)} sys={sys} openStyles={(focus) => setStylesOpen({ focus })} chapters={g.chapters.filter((c) => !c.hidden && !c.removed).map((c) => c.title)} />
          : null}
        {chId === HOME && home && stylesOpen ? <StylesWindow sys={sys} auto={autoSys} setSys={setSysKey} fonts={toolbarFonts(fonts)} colours={colours} focus={stylesOpen.focus} onAddFont={(then) => setFontAsk(() => then)} onClose={() => setStylesOpen(null)} /> : null}
        {ch ? <div className="ve-main">
          <Toolbar sel={sel} setSel={setSel} ch={ch} setBlocks={setBlocks} editBlock={editBlock} undo={() => step('undo')} redo={() => step('redo')} canUndo={past.current.length > 0} canRedo={future.current.length > 0} onStyles={() => setStylesOpen({})} onKeys={() => setKeysOpen(true)} onLayout={(b) => setPicker({ convert: b.id })}
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
          <div className={'ve-canvas pt' + (tool ? ' ve-adding' : '')} onMouseMoveCapture={(e) => { if (tool) setSpot(findSpot(e)); }} onMouseLeave={() => setSpot(null)} onMouseDownCapture={(e) => { if (!tool) { shiftPick(e); return; } e.preventDefault(); e.stopPropagation(); place(findSpot(e)); }} onClickCapture={(e) => { if (tool) { e.preventDefault(); e.stopPropagation(); } }}>
          <article className="pt-page ve-page gsys">
            <header className="pt-chhead ve-chhead">
              <p className="mute"><span className="pt-n">{String(g.chapters.indexOf(ch) + 1).padStart(2, '0')}</span><Editable value={ch.kicker} tag="span" {...chText('kicker', '')} placeholder="Label" onSave={(v) => setCh({ kicker: v, edited: true })} /></p>
              <Editable value={ch.title} tag="h1" {...chText('title', 'pt-display')} placeholder="Chapter title" onSave={(v) => setCh({ title: v || 'Untitled', edited: true })} />
              <Editable value={ch.lede} tag="p" {...chText('lede', 'pt-lede')} placeholder="Add an introduction (optional)" multiline onSave={(v) => setCh({ lede: v, edited: true })} />
              {ch.hidden ? <p className="tag">This chapter is hidden from the client</p> : null}
            </header>

            <div className="pt-blocks ve-blocks" ref={fitPage} {...fileDrag}>
              <SlideGap onAdd={() => setPicker({ at: 0 })} />
              {ch.blocks.map((b, i) => (b.hidden && !showHidden ? null : (
                <div key={b.id}>
                  {b.draft ? <div className={'ve-draft ' + b.draft} role="note">
                    <span className="ve-draft-tag">{b.draft === 'draft' ? 'Draft, check this' : 'Missing'}</span>
                    <span className="ve-draft-note">{b.draftNote}{b.draft === 'missing' && b.body ? ` For this tier: ${b.body}` : ''}</span>
                    {b.draft === 'draft' ? <><button className="btn solid" onClick={() => accept(b)}>Accept</button><button className="btn" onClick={() => removeBlock(b)}>Delete</button></>
                      : <><button className="btn solid" onClick={() => editBlock(b.id, { draft: undefined, draftNote: undefined, body: '' })}>Write it now</button><button className="btn" onClick={() => { removeBlock(b); dismissSlot(b.slot); }} title="Not needed for this client; it won’t be flagged again">Not needed</button></>}
                    <span className="mute">Hidden from the client until accepted.</span>
                  </div> : null}
                  <div className="ve-slide-label">
                    <span className="n">{secNo(ch.blocks, b)}</span>
                    {layoutOf(b) ? <button className="ve-slide-lay" onClick={() => { setSel({ block: b.id }); setPicker({ convert: b.id }); }} aria-label={`Layout: ${layoutLabel(b)}. Change layout`}>{layoutLabel(b)}<ChevronDown size={12} strokeWidth={2} aria-hidden /></button> : <span>{layoutLabel(b)}</span>}
                    {b.hidden ? <span className="ve-slide-hid">Hidden</span> : null}
                    {(() => { const n = comments.list.filter((c) => c.block === b.id && !c.resolved_at).length; return n ? <button type="button" className="ve-slide-cm" onClick={() => { setCommentsOpen({ only: b.id }); setHistoryOpen(false); }} aria-label={`${n} comment${n === 1 ? '' : 's'} on this section`}><MessageSquare size={12} strokeWidth={2} aria-hidden />{n}</button> : null; })()}
                  </div>
                  <div onPointerDown={(e) => armMove(e, b)} onMouseDown={(e) => {
                    // A click on a box (not its text or image) selects the box; anywhere else selects the section
                    const t = e.target as HTMLElement; const box = t.closest('[data-item]') as HTMLElement | null;
                    const spacer = t.closest('[data-spacer]') as HTMLElement | null;
                    if (spacer && box && !t.closest('.ve-grip-el')) { const it0 = (b.items || [])[Number(box.dataset.item)]; if (it0) { setSel({ block: b.id, item: Number(box.dataset.item), el: `${it0.id}.${spacer.dataset.el}` }); return; } }
                    // The container that holds the frames (the auto layout or grid itself): its gaps and edges
                    const cont = t.closest('.gb-columns, .gb-grid, .gc-track, .gc-wrap') as HTMLElement | null;
                    if (!box && cont && cont.closest('.ve-block') === e.currentTarget) { setSel({ block: b.id, el: 'items' }); return; }
                    if (box && !t.closest('.ed, .ve-img, .ve-hd') && box.closest('.ve-block') === e.currentTarget) setSel({ block: b.id, item: Number(box.dataset.item) });
                    else if (sel?.block !== b.id) setSel({ block: b.id });
                  }} data-block={b.id} data-sel={sel?.block === b.id ? (sel.el === 'items' ? 'items' : sel.item !== undefined ? 'frame' : 'section') : undefined} className={'ve-block ve-slide' + (b.kind === 'divider' ? ' ve-slide-div' : '') + (sel?.block === b.id ? ' sel' : '') + (b.hidden ? ' off' : '') + (b.draft ? ' is-draft' : '') + (over === b.id && drag?.kind === 'block' ? ' over' : '')}
                    onDragOver={(e) => { if (drag?.kind === 'block') { e.preventDefault(); setOver(b.id); } }} onDrop={() => { if (drag?.kind === 'block') moveBlock(drag.id, b.id); setDrag(null); setOver(null); }}>
                    {sel?.block === b.id ? <span className="ve-handle-tab" draggable onDragStart={() => setDrag({ kind: 'block', id: b.id })} onDragEnd={() => { setDrag(null); setOver(null); }} title="Drag to move" aria-label="Drag to move"><GripVertical size={12} strokeWidth={2} aria-hidden />{KINDS.find(([k]) => k === b.kind)?.[1]}</span> : <span className="ve-hint">Click to edit</span>}
                    {b.hidden ? <p className="ve-hidden">Hidden from the client · <button onClick={() => editBlock(b.id, { hidden: false })}>Show</button></p> : null}
                    <GuideBlock b={{ ...b, hidden: false }} urls={urls} headingLevel={3} number={b.kind === 'divider' ? subsIdx(b.id) : undefined} chapter={ch.title} edit={kitFor(b)} />
                  </div>
                  <SlideGap onAdd={() => setPicker({ at: i + 1 })} />
                </div>)))}
              <button className="ve-slide-add" onClick={() => setPicker({ at: ch.blocks.length })}><Plus size={18} strokeWidth={1.75} aria-hidden />Add a section<span>Choose a layout: columns, carousel, bento grid, a large image, or text and image</span></button>
            </div>

            {ch.rules.length ? <section className="pt-blk"><h2 className="pt-h2">The rules</h2><p className="mute" style={{ marginTop: -6 }}>From the review. Change them in the Review tab.</p><div className="pt-rules">{ch.rules.map((r, k) => <div key={k} className="pt-rule"><p className="pt-rule-h">{r.title}</p><p>{r.text}</p></div>)}</div></section> : null}
          </article>
        </div></div> : null}
        {picker && ch ? ('convert' in picker
          ? <LayoutPicker title="Change the layout" current={layoutOf(ch.blocks.find((x) => x.id === picker.convert)!)} onPick={(l) => changeLayout(picker.convert, l)} onClose={() => setPicker(null)} />
          : <LayoutPicker onPick={(l) => insertLayout(picker.at, l)} onPickKind={(k) => insertAt(picker.at, k)} onClose={() => setPicker(null)} figma={figmaPick} />) : null}
        {ch ? <AddBar onReview={() => setReviewOpen((o) => !o)} reviewOpen={reviewOpen} reviewCount={reviewCount} ch={ch} sel={sel?.block === CHAPTER ? null : sel} tool={tool} onTool={(w) => { setTool(w); setSpot(null); }} onSection={() => { const at = sel && sel.block !== CHAPTER ? ch.blocks.findIndex((x) => x.id === sel.block) + 1 : ch.blocks.length; setPicker({ at: at > 0 ? at : ch.blocks.length }); }} /> : null}
        {moving ? <><div className="ve-ghost" style={{ left: moving.x + 14, top: moving.y + 10 }} aria-hidden>{moving.label}</div>{moving.line ? <div className={'ve-spot ' + (moving.kind === 'box' ? 'vline' : 'line')} style={{ top: moving.line.top, left: moving.line.left, width: moving.line.width, height: moving.line.height }} aria-hidden /> : null}</> : null}
        {tool && spot ? <div className={'ve-spot ' + spot.mode} style={{ top: spot.line.top, left: spot.line.left, width: spot.line.width, height: spot.line.height }} aria-hidden><span>{spot.label}</span></div> : null}
        {ch && multi.length > 1 ? (() => {
          // What each selected thing is, and the text style or frame look it has now
          const items: MultiItem[] = multi.map((m) => {
            const k = selKey(m);
            if (m.block === CHAPTER) return { key: k, kind: 'text' as const, style: ch.styles?.[m.el!] || {}, auto: autoType(null, m.el!) };
            const b = ch.blocks.find((x) => x.id === m.block); const it = m.item !== undefined ? b?.items?.[m.item] : undefined;
            if (!b) return { key: k, kind: 'other' as const };
            if (it && !m.el) return { key: k, kind: 'frame' as const, look: it.look || {} };
            if (it && m.el) { const id = m.el.split('.')[1]; const e = it.els?.find((x) => x.id === id); if (e?.kind === 'frame') return { key: k, kind: 'frame' as const, look: e.look || {} }; if (e && (e.kind === 'image' || e.kind === 'spacer' || e.kind === 'icon')) return { key: k, kind: 'other' as const }; if (id === 'media') return { key: k, kind: 'other' as const }; return { key: k, kind: 'text' as const, style: b.styles?.[m.el] || {}, auto: autoType(b, m.el, it) }; }
            if (m.el && !m.el.startsWith('img')) return { key: k, kind: 'text' as const, style: b.styles?.[m.el] || {}, auto: autoType(b, m.el) };
            return { key: k, kind: 'other' as const };
          });
          const tidy = (o: TextStyle) => { (Object.keys(o) as (keyof TextStyle)[]).forEach((x) => o[x] === undefined && delete o[x]); return o; };
          // One change, applied to every selected thing, as one step to undo
          const setText = (patch: Partial<TextStyle>) => { const g0 = latest.current; if (!g0) return; commit({ ...g0, chapters: g0.chapters.map((c) => c.id !== chId ? c : { ...c,
            styles: multi.filter((m) => m.block === CHAPTER).reduce((st, m) => ({ ...st, [m.el!]: tidy({ ...(st[m.el!] || {}), ...patch }) }), c.styles || {}),
            blocks: c.blocks.map((b) => { const mine = multi.filter((m) => m.block === b.id && m.el && items.find((x) => x.key === selKey(m))?.kind === 'text'); return mine.length ? { ...b, edited: true, styles: mine.reduce((st, m) => ({ ...st, [m.el!]: tidy({ ...(st[m.el!] || {}), ...patch }) }), b.styles || {}) } : b; }) }) }); };
          const setLook = (patch: Partial<FrameLook>) => { const g0 = latest.current; if (!g0) return; commit({ ...g0, chapters: g0.chapters.map((c) => c.id !== chId ? c : { ...c, blocks: c.blocks.map((b) => { const mine = multi.filter((m) => m.block === b.id && m.item !== undefined); if (!mine.length) return b;
            return { ...b, edited: true, items: (b.items || []).map((it, n) => { const hits = mine.filter((m) => m.item === n); if (!hits.length) return it; let x = it;
              for (const m of hits) { if (!m.el) x = { ...x, look: { ...(x.look || {}), ...patch } }; else { const id = m.el.split('.')[1]; x = { ...x, els: (x.els || []).map((e) => (e.id === id && e.kind === 'frame' ? { ...e, look: { ...(e.look || {}), ...patch } } : e)) }; } }
              return x; }) }; }) }) }); };
          const delAll = () => { const g0 = latest.current; if (!g0) return; commit({ ...g0, chapters: g0.chapters.map((c) => c.id !== chId ? c : { ...c, blocks: c.blocks.map((b) => { const mine = multi.filter((m) => m.block === b.id); if (!mine.length) return b;
            if (mine.some((m) => m.item === undefined && !m.el)) return { ...b, hidden: true };
            const dropItems = new Set(mine.filter((m) => m.item !== undefined && !m.el).map((m) => m.item));
            const dropEls = mine.filter((m) => m.item !== undefined && m.el).map((m) => m.el!);
            const dropFields = mine.filter((m) => m.item === undefined && m.el).map((m) => m.el!);
            return { ...b, edited: true, ...Object.fromEntries(dropFields.filter((f) => !f.startsWith('x-')).map((f) => [f, undefined])), off: [...new Set([...(b.off || []), ...dropFields.filter((f) => !f.startsWith('x-'))])],
              extras: (b.extras || []).filter((x) => !dropFields.includes('x-' + x.id)),
              items: (b.items || []).filter((_, n) => !dropItems.has(n)).map((it) => { const ids = dropEls.filter((k) => k.startsWith(it.id + '.')).map((k) => k.split('.')[1]); if (!ids.length) return it; return it.els ? { ...it, els: it.els.filter((e) => !ids.includes(e.id)) } : { ...it, ...Object.fromEntries(ids.map((f) => [f, undefined])) }; }) }; }) }) });
            setMulti([]); setSel(null); };
          return <MultiPanel items={items} sys={sys} fonts={toolbarFonts(fonts)} palette={colours} openStyles={(focus) => setStylesOpen({ focus })} setText={setText} setLook={setLook} onDelete={delAll} onAddFont={(then) => setFontAsk(() => then)} />;
        })() : null}
        {ch && multi.length < 2 ? <Inspector onAddToBox={addToBox} sel={sel} setSel={setSel} ch={ch} colours={colours} editBlock={editBlock} pickImage={pickImage} sys={sys} setSys={setSysKey} openStyles={(focus) => setStylesOpen({ focus })} setChStyle={setChStyle} onFill={fillWithAi} filling={filling} onDelete={deleteSelection} onIcon={(block, item, replace) => setIconAt({ block, item, replace })} onMake={(block, target, aspect) => setMakeFor({ block, target, aspect })} fonts={toolbarFonts(fonts)} onAddFont={(then) => setFontAsk(() => then)} /> : null}
        {stylesOpen ? <StylesWindow sys={sys} auto={autoSys} setSys={setSysKey} fonts={toolbarFonts(fonts)} colours={colours} focus={stylesOpen.focus} onAddFont={(then) => setFontAsk(() => then)} onClose={() => setStylesOpen(null)} /> : null}
        {keysOpen ? <Shortcuts onClose={() => setKeysOpen(false)} /> : null}
        {makeFor ? <MakeDialog onMake={make} onClose={() => setMakeFor(null)} aspect={makeFor.aspect} /> : null}
        {iconAt && g ? <IconPicker set={g.icons?.set || 'lucide'} onSet={(set) => { if (set !== (g.icons?.set || 'lucide') && set !== 'custom') commit({ ...(latest.current || g), icons: { set } }); }} onPick={putIcon} onClose={() => setIconAt(null)} /> : null}
        {g ? <CreativeDirector projectId={projectId} guide={g} chapterId={chId} history={readSessions(content)} known={known} goTo={reviewGoTo} apply={reviewApply} rewrite={reviewRewrite} focusOn={reviewFocus()} open={reviewOpen} setOpen={setReviewOpen} onCount={setReviewCount} /> : null}
        <style dangerouslySetInnerHTML={{ __html: systemCss(sys) }} />
      </div>
      {ask ? <Confirm ask={ask} onClose={() => setAsk(null)} /> : null}
      {fontAsk ? <FontDialog projectId={projectId} fonts={fonts} onClose={() => setFontAsk(null)} onDone={(next, urls, role) => { setFonts(next); setLiveFontCss(fontFaceCss(next, urls)); fontAsk(role); setFontAsk(null); }} /> : null}
      {rebuildOpen ? <ImportDialog projectId={projectId} onClose={() => setRebuildOpen(false)} onRun={rebuild} /> : null}
      <p className="mute">Built {new Date(g.generatedAt).toLocaleString('en-GB')} from “{g.page}” in {g.file}. Sections you edit or add are kept when you rebuild.</p>
    </div>
  );
}

/** Between two slides: a line with an add button, to put a new section exactly there */
/** A big photo made smaller in the browser: at most 3200px on its long side, as WebP (keeps transparency) */
async function shrink(file: File, d: { w: number; h: number }): Promise<{ file: File; w: number; h: number } | null> {
  const k = Math.min(1, 3200 / Math.max(d.w, d.h)); const w = Math.round(d.w * k), h = Math.round(d.h * k);
  const bmp = await createImageBitmap(file); const c = document.createElement('canvas'); c.width = w; c.height = h;
  const cx = c.getContext('2d'); if (!cx) return null; cx.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  for (const q of [0.9, 0.82, 0.72]) {
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/webp', q));
    if (blob && blob.size <= 3.8 * 1024 * 1024) return { file: new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' }), w, h };
  }
  return null;
}
/** The portal's page: 1024px of content inside 48px margins */
const PAGE_W = 1120;
/** How much the canvas is zoomed out to fit the editor (1 when the page fits at its real width) */
const zoomOf = (el: Element) => { const w = (el as HTMLElement).offsetWidth; return w ? el.getBoundingClientRect().width / w || 1 : 1; };

function SlideGap({ onAdd }: { onAdd: () => void }) {
  return <div className="ve-gap"><button className="ve-gap-btn" onClick={onAdd} aria-label="Add a section here" data-tip="Add a section here"><Plus size={14} strokeWidth={2} aria-hidden /></button></div>;
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
function HomeEditor({ projectId, home, chapters, colours, fonts, sys, openStyles }: { projectId: string; home: HomeData; chapters: string[]; colours: { name: string; hex: string }[]; fonts: ToolbarFont[]; sys: GuideSystem; openStyles: (focus?: TypeId) => void }) {
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
  return <><div className="ve-main">
    <div className="tb" role="status"><span className="tb-ctx tb-empty" style={{ borderLeft: 0 }}><House size={15} strokeWidth={1.75} aria-hidden />Home page · {msg || 'Click the title or the welcome to edit it'}</span><div className="tb-grp tb-end"><button type="button" className="tb-btn wide" onClick={() => openStyles()}><Palette size={16} strokeWidth={1.75} aria-hidden />Styles</button></div></div>
    <div className="ve-canvas pt"><style dangerouslySetInnerHTML={{ __html: systemCss(sys) }} /><article className="pt-page ve-page hm-body gsys">
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
  </div>
  {sel ? <Inspector sel={sel} setSel={setSel} ch={fake} colours={colours} editBlock={() => {}} pickImage={() => {}} sys={sys} setSys={() => {}} openStyles={openStyles} setChStyle={(f, st) => setStyle(f, st)} onDelete={() => {}} fonts={fonts} />
    : <aside className="dp" aria-label="About the home page"><div className="dp-sec"><p className="dp-h"><House size={15} strokeWidth={1.75} aria-hidden />Home page</p><p className="dp-tip" style={{ padding: 0 }}>The first page clients see. Click the title or the welcome to edit them. Leave the welcome empty to use the standard one. Changes here show straight away, without publishing.</p><p className="dp-tip" style={{ padding: 0 }}>The showcase reel runs above it, and the chapters and recently used apps follow below.</p></div></aside>}
  </>;
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
