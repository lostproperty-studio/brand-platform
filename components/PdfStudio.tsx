'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, ArrowUpRight, ChevronRight, Download, Eye, EyeOff, Grid3x3, Link2, Link2Off, Loader2, RotateCcw, SeparatorHorizontal } from 'lucide-react';
import type { Block, Guide } from '@/lib/portal/guide';
import { defaultSystem, type GuideSystem, type SpaceRule } from '@/lib/guideSystem';
import { itemEls } from '@/lib/figma/blocks';
import {
  SLIDE_H, SLIDE_W, STYLE_IDS, STYLE_USE, blockImages, canBecome, defaultStyles, diffBlock, logoFor, mergeBlock, ovEntries, readPdf, resolveStyles, slideSpec, slideSysCss, tidyOv, visibleBlock,
  type BlockOv, type Fit, type KitLogo, type Look, type LogoPlace, type PdfCase, type PdfSettings, type PdfStyle, type SlideOverrides, type StyleId, type VAlign
} from '@/lib/pdf';
import { Slide, SlideBox, type SlideCtx, type SlideInfo } from '@/components/pdf/Slide';
import { Focus, I, Num, Pics, Row, Seg, SpanPick, Swatches } from '@/components/pdf/controls';
import { Inspector } from '@/components/GuideInspector';
import type { Sel, ToolbarFont } from '@/components/GuideDock';
import { LayersPanel } from '@/components/LayersPanel';
import '@/components/pdf/pdf.css';

type Colour = { name: string; hex: string };
type Font = { role: string; name: string; weights?: number[] };
type Rect = { x: number; y: number; w: number; h: number };

// The PDF tab: a slide editor for the guidelines as a 16:9 deck, built to feel like the guideline editor. Each section
// slide is the guideline's section itself, in its own styles, laid across the slide: the header above the hang line,
// the body hanging from it. Click a section, frame, text or image on the slide to select it, and the design panel
// shows the guideline editor's own controls for it. The words and pictures are linked to the guidelines (the
// master) and can't be changed here; every layout and formatting change is kept in the PDF's settings, shown as a
// change from the guidelines, and can be put back one at a time or for the whole slide.
export function PdfStudio({ projectId, client, guide, urls, logos = [], colours, content, fontCss, system, fonts }: {
  projectId: string; client: string; guide: Guide | null; urls: Record<string, string>; logos?: KitLogo[]; colours: Colour[];
  content: unknown; fontCss: string; system: GuideSystem | null; fonts: Font[];
}) {
  const [cfg, setCfg] = useState<PdfSettings>(() => readPdf(content, colours));
  const [sel, setSel] = useState('title');
  const [dsel, setDsel] = useState<Sel | null>(null);
  const [tab, setTab] = useState<'design' | 'slide' | 'doc'>('slide');
  const [printing, setPrinting] = useState(false);
  const [msg, setMsg] = useState('');
  const [added, setAdded] = useState<Record<string, string>>({});
  const [show, setShow] = useState({ grid: true, hang: true });
  const [linked, setLinked] = useState(() => { const m = cfg.margins; return m.left === m.right && m.top === m.bottom; });
  const [overflow, setOverflow] = useState('');
  const allUrls = useMemo(() => ({ ...urls, ...added }), [urls, added]);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem('pd2-show') || 'null'); if (v && typeof v.grid === 'boolean') setShow(v); } catch { /* the default is fine */ } }, []);
  const toggle = (k: 'grid' | 'hang') => setShow((s) => { const n = { ...s, [k]: !s[k] }; try { localStorage.setItem('pd2-show', JSON.stringify(n)); } catch { /* not kept */ } return n; });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(cfg); latest.current = cfg;
  const save = useCallback((next: PdfSettings) => {
    latest.current = next; setCfg(next); setMsg('Saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { pdf: latest.current } }) }).then((r) => setMsg(r.ok ? 'Saved' : 'Couldn’t save. Try again.')).catch(() => setMsg('Couldn’t save. Try again.')); }, 600);
  }, [projectId]);
  useEffect(() => { if (msg !== 'Saved' && msg !== 'Linked') return; const t = setTimeout(() => setMsg(''), 1500); return () => clearTimeout(t); }, [msg]);

  const chapters = (guide?.chapters || []).filter((c) => !c.removed && !c.hidden);
  const skip = new Set(cfg.skip || []);
  // Every slide, in order, with page numbers for the ones that go in
  const all: SlideInfo[] = useMemo(() => {
    const out: SlideInfo[] = [{ kind: 'title', id: 'title', label: 'Title', page: 0 }];
    chapters.forEach((c, n) => {
      out.push({ kind: 'divider', chapter: c.id, n: n + 1, id: 'd:' + c.id, label: c.title, page: 0 });
      for (const b of c.blocks) if (!b.hidden && b.draft !== 'draft' && b.draft !== 'missing' && b.kind !== 'cover' && b.kind !== 'divider' && b.kind !== 'spacer') out.push({ kind: 'section', chapter: c.id, n: n + 1, block: b.id, id: 's:' + b.id, label: (b.heading || b.eyebrow || 'Section').replace(/\s+/g, ' ').slice(0, 48), page: 0 });
    });
    let p = 1; for (const s of out) { const off = s.kind !== 'title' && (skip.has(s.chapter) || (s.kind === 'section' && skip.has(s.block))); s.page = off ? 0 : p++; }
    return out;
  }, [guide, cfg.skip]); // eslint-disable-line react-hooks/exhaustive-deps
  const included = all.filter((s) => s.page > 0);
  const cur = all.find((s) => s.id === sel) || all[0];
  const curCh = cur.kind !== 'title' ? chapters.find((c) => c.id === cur.chapter) : undefined;
  const master = cur.kind === 'section' ? curCh?.blocks.find((b) => b.id === cur.block) : undefined;
  const ov: SlideOverrides = cfg.slides[cur.id] || {};
  // The section as the slide shows it: the guide's, with this slide's changes, without what's left out
  const shown: Block | undefined = useMemo(() => (master ? visibleBlock(mergeBlock(master, ov.block)) : undefined), [master, ov.block]);
  const spec = slideSpec(cfg, cur.id, cur.kind, shown);
  const skipKey = cur.kind === 'divider' ? cur.chapter : cur.kind === 'section' ? cur.block : null;
  const toggleSkip = (id: string) => save({ ...cfg, skip: skip.has(id) ? [...skip].filter((x) => x !== id) : [...skip, id] });
  // A new slide selects its section, and the design panel when it has one
  useEffect(() => { setDsel(cur.kind === 'section' ? { block: cur.block } : null); setTab((t) => (cur.kind === 'section' ? (t === 'slide' ? 'design' : t) : t === 'design' ? 'slide' : t)); }, [cur.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sys0 = useMemo(() => system || defaultSystem({}), [system]);
  const sys: GuideSystem = useMemo(() => ({ ...sys0, space: { ...sys0.space, ...cfg.space } }), [sys0, cfg.space]);
  const styles = resolveStyles(cfg, system);
  const base = useMemo(() => defaultStyles(system), [system]);
  const typeCss = STYLE_IDS.map((id) => { const s = styles[id]; return `.pd2-root .pd2-t-${id}, .pd2-print .pd2-t-${id} { font-family: var(--font-${s.font}, var(--font)); font-size: ${s.size}px; font-weight: ${s.weight}; line-height: ${s.leading}; letter-spacing: ${s.tracking}em; text-transform: ${s.case === 'upper' ? 'uppercase' : s.case === 'lower' || s.case === 'sentence' ? 'lowercase' : s.case === 'title' ? 'capitalize' : 'none'}; font-variant-caps: ${s.case === 'smallcaps' ? 'all-small-caps' : 'normal'}; }${s.case === 'sentence' ? ` .pd2-root .pd2-t-${id}::first-letter, .pd2-print .pd2-t-${id}::first-letter { text-transform: uppercase; }` : ''}`; }).join('\n');
  const guideCss = slideSysCss(styles, sys.space, cfg.scale);

  // A slide's own settings: set some, or clear them back to the document's
  const setOvFor = (id: string, patch: Partial<SlideOverrides>) => {
    const c = latest.current; const cur0 = c.slides[id] || {};
    const n: Record<string, unknown> = { ...cur0, ...patch };
    for (const k of Object.keys(n)) if (n[k] === undefined) delete n[k];
    const slides = { ...c.slides }; if (Object.keys(n).length) slides[id] = n as SlideOverrides; else delete slides[id];
    save({ ...c, slides });
  };
  const setOv = (patch: Partial<SlideOverrides>) => setOvFor(cur.id, patch);
  const clear = (...keys: (keyof SlideOverrides)[]) => setOv(Object.fromEntries(keys.map((k) => [k, undefined])));
  const has = (...keys: (keyof SlideOverrides)[]) => keys.some((k) => ov[k] !== undefined);
  const setKind = <K extends 'title' | 'divider' | 'section'>(k: K, v: Partial<PdfSettings[K]>) => save({ ...cfg, [k]: { ...cfg[k], ...v } });
  const setStyle = (id: StyleId, v: Partial<PdfStyle> | null) => {
    const st = { ...cfg.styles };
    if (!v) delete st[id]; else { const n = { ...(st[id] || {}), ...v } as Record<string, unknown>; for (const [k, x] of Object.entries(n)) if (x === (base[id] as Record<string, unknown>)[k]) delete n[k]; if (Object.keys(n).length) st[id] = n as Partial<PdfStyle>; else delete st[id]; }
    save({ ...cfg, styles: st });
  };

  // ---------- Formatting a section in the PDF: the guideline editor's changes, kept as the slide's own
  const setBlockOv = (block: BlockOv | undefined) => setOv({ block: tidyOv(block) });
  const editBlock = (_id: string, patch: Partial<Block>) => {
    if (!master || !shown) return;
    if (patch.kind && patch.kind !== shown.kind && !canBecome(master, patch.kind)) { setMsg('That layout rearranges the words and pictures, so it can only be changed in Guidelines.'); return; }
    const latestOv = latest.current.slides[cur.id]?.block;
    const now = visibleBlock(mergeBlock(master, latestOv));
    setBlockOv(diffBlock(master, { ...now, ...patch }, latestOv));
  };
  const linkedMsg = () => setMsg('Pictures are linked to the guidelines. Replace them in Guidelines and the PDF follows.');
  const setSys = (s: GuideSystem) => { const space: Partial<Record<SpaceRule, number>> = {}; for (const [k, v] of Object.entries(s.space) as [SpaceRule, number][]) if (v !== sys0.space[k]) space[k] = v; save({ ...latest.current, space }); };
  /** Leave the selected text, picture, element or frame out of this slide (it stays in the guidelines) */
  const hideSel = (at: Sel | null = dsel) => {
    if (!shown || !at) return;
    const el = at.el, items = shown.items || [], i = at.item;
    if (el === 'eyebrow' || el === 'heading' || el === 'body') { editBlock(shown.id, { [el]: undefined } as Partial<Block>); setDsel({ block: shown.id }); return; }
    if (el?.startsWith('x-')) { editBlock(shown.id, { extras: (shown.extras || []).filter((x) => 'x-' + x.id !== el) }); setDsel({ block: shown.id }); return; }
    if (el?.startsWith('img:')) { const k = Number(el.slice(4)); editBlock(shown.id, { media: (shown.media || []).map((m, n) => (n === k ? { ...m, path: '' } : m)) }); setDsel({ block: shown.id }); return; }
    if (i === undefined || !items[i]) return;
    const it = items[i];
    if (el?.startsWith('itemimg:')) { editBlock(shown.id, { items: items.map((x, n) => (n === i ? { ...x, media: undefined } : x)) }); setDsel({ block: shown.id, item: i }); return; }
    if (el?.includes('.')) {
      const eid = el.split('.')[1];
      editBlock(shown.id, { items: items.map((x, n) => (n !== i ? x : x.els ? { ...x, els: x.els.filter((e) => e.id !== eid) } : { ...x, [eid]: undefined })) });
      setDsel({ block: shown.id, item: i }); return;
    }
    editBlock(shown.id, { items: items.filter((x) => x.id !== it.id) }); setDsel({ block: shown.id });
  };

  async function upload(f: File): Promise<string | null> {
    setMsg('Uploading…');
    const fd = new FormData(); fd.set('file', f);
    const r = await fetch(`/api/projects/${projectId}/guide/upload`, { method: 'POST', body: fd }).catch(() => null); const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok || !j.path) { setMsg(j.error || 'The upload didn’t go through.'); return null; }
    setAdded((a) => ({ ...a, [j.path]: j.url })); setMsg(''); return j.path as string;
  }

  async function exportPdf() {
    setPrinting(true); setMsg('Getting the slides ready…');
    // Wait for the print copy to render, its pictures to load and the fonts to be ready
    await new Promise((r) => setTimeout(r, 150));
    await document.fonts?.ready;
    const imgs = [...document.querySelectorAll<HTMLImageElement>('.pd2-print img')];
    await Promise.all(imgs.map((im) => { im.loading = 'eager'; return im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; setTimeout(r, 8000); }); }));
    await new Promise((r) => setTimeout(r, 300));
    const was = document.title; document.title = `${client} brand guidelines`;
    setMsg('');
    window.print();
    document.title = was; setPrinting(false);
  }

  // Pictures to choose from: this slide's chapter first, then the rest of the guide, then this session's uploads
  const pics = useMemo(() => {
    const seen = new Set<string>(); const out: { path: string; url: string }[] = [];
    const add = (p?: string) => { if (p && !seen.has(p) && allUrls[p] && !/\.(svg|mp4|webm|mov)$/i.test(p)) { seen.add(p); out.push({ path: p, url: allUrls[p] }); } };
    Object.keys(added).forEach(add);
    if (curCh) for (const b of curCh.blocks) blockImages(b).filter((m) => m.kind === 'photo').forEach((m) => add(m.path));
    for (const c of chapters) for (const b of c.blocks) blockImages(b).filter((m) => m.kind === 'photo').forEach((m) => add(m.path));
    return out.slice(0, 24);
  }, [curCh, chapters, allUrls, added]); // eslint-disable-line react-hooks/exhaustive-deps
  const withCurrent = (p?: string) => (p && allUrls[p] && !pics.some((x) => x.path === p) ? [{ path: p, url: allUrls[p] }, ...pics] : pics);

  const ctx: SlideCtx | null = guide ? { cfg, guide, urls: allUrls, logos, client, total: included.length } : null;
  const onWords = (s: SlideInfo) => (k: string, v: string) => {
    if (s.kind === 'title') setKind('title', { [k]: v || undefined } as Partial<PdfSettings['title']>);
    if (s.kind === 'divider') save({ ...cfg, dividers: { ...(cfg.dividers || {}), [s.chapter]: { ...(cfg.dividers?.[s.chapter] || {}), [k]: v || undefined } } });
  };

  // ---------- Selecting on the slide, as in the guideline editor
  const boxRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<{ sel: Rect | null; hover: Rect | null; marks: Rect[] }>({ sel: null, hover: null, marks: [] });
  const hoverNode = useRef<HTMLElement | null>(null);
  const visibleMedia = (b: Block) => (b.media || []).map((m, k) => ({ m, k })).filter(({ m }) => m.path && allUrls[m.path]).map(({ k }) => k);
  const itemNodes = (z: Element | null) => (z ? [...z.querySelectorAll<HTMLElement>('.gi, .gc-card')] : []);
  /** What was clicked: the text, picture, element in a frame, frame or section under the pointer */
  const selAt = (t: HTMLElement): Sel | null => {
    if (!shown) return null;
    const block = shown.id;
    const f = t.closest<HTMLElement>('[data-pdf-field]'); if (f) return { block, el: f.dataset.pdfField };
    const z = t.closest('[data-zone="body"]'); if (!z) return { block };
    const items = shown.items || [];
    const itemNode = t.closest<HTMLElement>('.gi, .gc-card');
    if (itemNode && z.contains(itemNode)) {
      const i = itemNodes(z).indexOf(itemNode); const it = items[i]; if (!it) return { block };
      const e = t.closest<HTMLElement>('[data-el]');
      if (e && itemNode.contains(e)) { const eid = e.dataset.el!; return !it.els && eid === 'media' ? { block, item: i, el: `itemimg:${i}` } : { block, item: i, el: `${it.id}.${eid}` }; }
      return { block, item: i };
    }
    const group = t.closest('.gb-columns, .gb-grid, .gc-track'); if (group && z.contains(group)) return { block, el: 'items' };
    const fig = t.closest<HTMLElement>('.gb-fig');
    if (fig && z.contains(fig)) { const k = [...z.querySelectorAll('.gb-fig')].indexOf(fig); const orig = visibleMedia(shown)[k]; if (orig !== undefined) return { block, el: `img:${orig}` }; }
    const part = t.closest<HTMLElement>('[data-part^="x-"]'); if (part) return { block, el: part.dataset.part };
    if (t.closest('.gb-stmt-h, .gb-h')) return { block, el: 'heading' };
    if (t.closest('.gb-eb')) return { block, el: 'eyebrow' };
    if (t.closest('.gb-body')) return { block, el: 'body' };
    return { block };
  };
  /** Where a selection is on the slide */
  const nodesFor = (s: Sel | null): HTMLElement[] => {
    const root = boxRef.current; if (!root || !s || !shown) return [];
    const head = root.querySelector<HTMLElement>('[data-zone="head"]'), z = root.querySelector<HTMLElement>('[data-zone="body"]');
    const el = s.el;
    if (s.item !== undefined) {
      const node = itemNodes(z)[s.item]; if (!node) return [];
      if (!el) return [node];
      if (el.startsWith('itemimg:')) return [node.querySelector<HTMLElement>('[data-el="media"]') || node];
      const eid = el.split('.')[1]; const e = node.querySelector<HTMLElement>(`[data-el="${CSS.escape(eid)}"]`);
      return [e?.querySelector<HTMLElement>(':scope > .fr, :scope > .gi-icon, :scope > p, :scope > div') || e || node];
    }
    if (!el) return [head, z].filter(Boolean) as HTMLElement[];
    if (el === 'items') { const g = z?.querySelector<HTMLElement>('.gb-columns, .gb-grid, .gc-track'); return g ? [g] : []; }
    const field = root.querySelector<HTMLElement>(`[data-pdf-field="${CSS.escape(el)}"]`); if (field) return [field];
    if (el.startsWith('img:')) { const k = visibleMedia(shown).indexOf(Number(el.slice(4))); const f = z?.querySelectorAll<HTMLElement>('.gb-fig')[k]; return f ? [f] : []; }
    if (el.startsWith('x-')) { const p = z?.querySelector<HTMLElement>(`[data-part="${CSS.escape(el)}"]`); return p ? [p] : []; }
    const sel0 = el === 'heading' ? '.gb-stmt-h, .gb-h' : el === 'eyebrow' ? '.gb-eb' : '.gb-body';
    const n = [...(z?.querySelectorAll<HTMLElement>(sel0) || [])].find((x) => !x.closest('.gi, .gc-card'));
    return n ? [n] : [];
  };
  const rectOf = (ns: HTMLElement[]): Rect | null => {
    const box = boxRef.current?.getBoundingClientRect(); if (!box || !ns.length) return null;
    const rs = ns.map((n) => n.getBoundingClientRect()).filter((r) => r.width || r.height); if (!rs.length) return null;
    const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top)), r = Math.max(...rs.map((q) => q.right)), b = Math.max(...rs.map((q) => q.bottom));
    return { x: x - box.left, y: y - box.top, w: r - x, h: b - y };
  };
  const entries = useMemo(() => (master ? ovEntries(ov.block, master) : []), [master, ov.block]);
  // The selection outline, the hover outline and a dot on everything changed for the PDF, measured after each render
  useLayoutEffect(() => {
    const measure = () => {
      const marks: Rect[] = [];
      if (shown) for (const e of entries) {
        const i = e.scope.item ? (shown.items || []).findIndex((x) => x.id === e.scope.item) : -1;
        if (e.scope.item && i < 0) continue;
        const s: Sel = { block: shown.id, ...(i >= 0 ? { item: i } : {}), ...(e.scope.el ? { el: e.scope.el } : e.scope.text ? { el: e.scope.text } : {}) };
        if (!e.scope.item && !e.scope.el && !e.scope.text) continue;
        const r = rectOf(nodesFor(s)); if (r && !marks.some((m) => m.x === r.x && m.y === r.y)) marks.push(r);
      }
      setRects((p) => ({ ...p, sel: rectOf(nodesFor(dsel)), marks }));
    };
    measure();
    const t = setTimeout(measure, 120); document.fonts?.ready.then(measure);
    return () => clearTimeout(t);
  }, [dsel, cfg, cur.id, entries]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDown = (e: React.MouseEvent) => {
    if (cur.kind !== 'section' || (e.target as HTMLElement).closest('.pd3-chip')) return;
    const s = selAt(e.target as HTMLElement); if (!s) return;
    e.preventDefault(); setDsel(s); setTab('design');
  };
  const onMove = (e: React.MouseEvent) => {
    if (cur.kind !== 'section') return;
    const s = selAt(e.target as HTMLElement); const ns = nodesFor(s);
    if (ns[0] === hoverNode.current) return; hoverNode.current = ns[0] || null;
    setRects((p) => ({ ...p, hover: rectOf(ns) }));
  };
  const up = () => { if (!dsel || !shown) return; if (dsel.el && dsel.item !== undefined) setDsel({ block: shown.id, item: dsel.item }); else if (dsel.el || dsel.item !== undefined) setDsel({ block: shown.id }); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if (t.closest('input, textarea, select, [contenteditable="true"]')) return; if (e.key === 'Escape' && tab === 'design') { e.preventDefault(); up(); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });

  // Words that run past the margins, so the studio can change the columns, the hang line or the type
  useEffect(() => {
    let alive = true;
    const check = () => {
      const root = boxRef.current; if (!root || !alive) return;
      const z = root.getBoundingClientRect().width / SLIDE_W; const top = root.getBoundingClientRect().top;
      const head = root.querySelector<HTMLElement>('[data-zone="head"]'), body = root.querySelector<HTMLElement>('[data-zone="body"] > .pd3-g'), area = root.querySelector<HTMLElement>('.pd2-area');
      let w = '';
      if (head && head.getBoundingClientRect().top < top + cfg.margins.top * z - 2) w = 'The header runs above the top margin: lower the hang line, widen the header columns or make the headline smaller';
      if (body) { const r = body.getBoundingClientRect(); const kids = [...body.querySelectorAll<HTMLElement>(':scope > * > *')]; if (kids.some((k) => k.getBoundingClientRect().bottom > r.bottom + 2)) w = 'The body runs past the bottom margin: raise the hang line, use more columns per row or smaller type'; }
      if (area) { const r = area.getBoundingClientRect(); if ([...area.children].some((k) => { const b = k.getBoundingClientRect(); return b.bottom > r.bottom + 2 || b.top < r.top - 2; })) w = 'Runs past the margin: try other columns or smaller type'; }
      setOverflow(w);
    };
    const t = setTimeout(check, 80); document.fonts?.ready.then(check);
    return () => { alive = false; clearTimeout(t); };
  });

  // The slide list moves with the arrow keys
  const filmKey = (e: React.KeyboardEvent) => {
    const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0; if (!d) return;
    e.preventDefault(); const i = all.findIndex((s) => s.id === cur.id); const n = all[Math.max(0, Math.min(all.length - 1, i + d))];
    setSel(n.id); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-th="${CSS.escape(n.id)}"]`)?.focus());
  };

  if (!guide || !chapters.length || !ctx) return <p className="mute">Build the guidelines first. The PDF is made from them.</p>;

  const guideHref = (block?: string) => `/studio/projects/${projectId}?tab=guidelines${curCh ? `&ch=${encodeURIComponent(curCh.id)}` : ''}${block ? `&b=${encodeURIComponent(block)}` : ''}`;
  const lookOf = (kind: 'title' | 'divider' | 'section'): Look => cfg[kind];
  const kindName = cur.kind === 'title' ? 'title slide' : cur.kind === 'divider' ? 'dividers' : 'content slides';
  const L = spec.look;
  const imgs = shown ? blockImages(shown) : [];
  const feature = imgs[Math.min(spec.pick, Math.max(0, imgs.length - 1))];
  const logoOpts: [LogoPlace, string][] = [['none', 'No logo'], ['top-left', 'Top left'], ['top-right', 'Top right'], ['centre', 'Centre'], ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right']];
  const alignSeg = (v: Look['align'], set: (x: Look['align']) => void) => <Seg value={v} set={set} label="Alignment" opts={[['left', <AlignLeft key="l" {...I} />, 'Left'], ['centre', <AlignCenter key="c" {...I} />, 'Centre']]} />;
  const vSeg = (v: VAlign, set: (x: VAlign) => void) => <Seg value={v} set={set} label="Vertical position" opts={[['top', 'Top', 'Top margin'], ['hang', 'Hang', 'From the hang line'], ['centre', 'Mid', 'Centre'], ['bottom', 'Base', 'Bottom margin']]} />;
  const fitSeg = (v: Fit, set: (x: Fit) => void) => <Seg value={v} set={set} label="Fit" opts={[['cover', 'Fill'], ['contain', 'Fit']]} />;
  const logoPick = (value: string | undefined, set: (k: string | undefined) => void, label: string, auto: string) => <select className="pd2-in" value={value || ''} onChange={(e) => set(e.target.value || undefined)} aria-label={label}>
    <option value="">{auto}</option>{logos.map((l) => <option key={l.key} value={l.key}>{l.name}{l.light ? ' (for dark backgrounds)' : ''}</option>)}</select>;
  const slideLogo = logoFor(logos, cfg, L.ink, ov.logoFile);

  // ---------- Design: the guideline editor's panel for what's selected, over the linked master
  const fontsTb: ToolbarFont[] = fonts.map((f) => ({ role: f.role, label: f.name, name: f.name, weights: f.weights || [] }));
  const selItem = dsel?.item !== undefined ? shown?.items?.[dsel.item] : undefined;
  const elKind = (() => { const el = dsel?.el; if (!el || el === 'items') return null; if (el.startsWith('img:') || el.startsWith('itemimg:')) return 'image'; if (el.includes('.')) { const eid = el.split('.')[1]; const e = selItem ? itemEls(selItem).find((x) => x.id === eid) : undefined; return e?.kind === 'image' || (e?.kind === 'frame' && e.look?.fill && e.look.fill.type !== 'colour' && e.look.fill.type !== 'gradient') ? 'image' : e?.kind === 'frame' || e?.kind === 'spacer' ? 'frame' : e?.kind === 'icon' ? 'icon' : 'text'; } return 'text'; })();
  const crumbs = !shown || !dsel ? [] : [
    { label: shown.kind === 'columns' ? 'Auto layout' : shown.kind[0].toUpperCase() + shown.kind.slice(1), sel: { block: shown.id } as Sel },
    ...(dsel.item !== undefined ? [{ label: `Frame ${dsel.item + 1}`, sel: { block: shown.id, item: dsel.item } as Sel }] : []),
    ...(dsel.el === 'items' ? [{ label: 'Frames', sel: dsel }] : dsel.el ? [{ label: elKind === 'image' ? 'Picture' : elKind === 'frame' ? 'Frame inside' : elKind === 'icon' ? 'Icon' : ({ eyebrow: 'Label', heading: 'Headline', body: 'Text' } as Record<string, string>)[dsel.el] || 'Text', sel: dsel }] : [])
  ];
  const selItemId = selItem?.id;
  // Everything selectable in the section, for the keyboard: its texts, pictures, frames and what's in each frame
  const layerOpts: [string, string][] = !shown ? [] : [
    [JSON.stringify({ block: shown.id }), 'Section'],
    ...(['eyebrow', 'heading', 'body'] as const).filter((f) => shown[f]).map((f) => [JSON.stringify({ block: shown.id, el: f }), `${({ eyebrow: 'Label', heading: 'Headline', body: 'Text' })[f]}: ${shown[f]!.replace(/\s+/g, ' ').slice(0, 30)}`] as [string, string]),
    ...(shown.media || []).map((m, k) => [m, k] as const).filter(([m]) => m.path && allUrls[m.path]).map(([, k]) => [JSON.stringify({ block: shown.id, el: `img:${k}` }), `Picture ${k + 1}`] as [string, string]),
    ...(shown.items || []).flatMap((it, i) => [[JSON.stringify({ block: shown.id, item: i }), `Frame ${i + 1}`] as [string, string],
      ...itemEls(it).map((e) => [JSON.stringify({ block: shown.id, item: i, el: !it.els && e.id === 'media' ? `itemimg:${i}` : `${it.id}.${e.id}` }), `  Frame ${i + 1} › ${e.kind === 'text' ? 'Text' : e.kind[0].toUpperCase() + e.kind.slice(1)}${e.text ? ': ' + e.text.replace(/\s+/g, ' ').slice(0, 24) : ''}`] as [string, string])])
  ];
  const mine = entries.filter((e) => (dsel?.item === undefined ? !e.scope.item : e.scope.item === selItemId) && (!dsel?.el || !e.scope.text && !e.scope.el ? true : e.scope.text === dsel.el || e.scope.el === dsel.el));
  const others = entries.filter((e) => !mine.includes(e));
  const dropEntry = (id: string) => { const e = entries.find((x) => x.id === id); if (e && ov.block) setBlockOv(e.drop(ov.block)); };
  const chEntry = (e: (typeof entries)[number]) => <li key={e.id}><span><i aria-hidden />{e.group !== 'Section' && e.group !== 'Text' ? <b>{e.group} · </b> : null}{e.label}</span><button type="button" className="pd2-reset" onClick={() => dropEntry(e.id)} aria-label={`Reset ${e.label.toLowerCase()} to the guidelines`} title="Back to the guidelines"><RotateCcw {...I} size={13} /></button></li>;
  const designTab = !shown || !curCh || !master ? <p className="pd2-note" style={{ padding: 16 }}>Title slides and dividers have no section. Use the Slide tab.</p> : <div className="pd3-design">
    <section className="pd2-sec pd3-linked" aria-label="Linked to the guidelines">
      <p className="pd3-lk"><Link2 {...I} /><span><b>Linked to Guidelines.</b> The words and pictures come from the guidelines and follow every change there. Layout and formatting changes here are for this PDF only.</span></p>
      <label className="pd3-jump"><span>Select</span><select className="pd2-in" value={JSON.stringify(dsel || { block: shown.id })} onChange={(e) => setDsel(JSON.parse(e.target.value))} aria-label="Select part of the section">{layerOpts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}{layerOpts.some(([v]) => v === JSON.stringify(dsel)) ? null : <option value={JSON.stringify(dsel)}>{crumbs.map((c) => c.label).join(' › ')}</option>}</select></label>
      <nav className="pd3-crumbs" aria-label="Selection">{crumbs.map((c, i) => <span key={i}>{i ? <ChevronRight {...I} size={12} /> : null}<button type="button" aria-current={i === crumbs.length - 1 ? 'true' : undefined} onClick={() => setDsel(c.sel)}>{c.label}</button></span>)}</nav>
      <div className="pd3-acts">
        <a className="btn" href={guideHref(shown.id)}><ArrowUpRight {...I} />{elKind === 'text' ? 'Edit the words in Guidelines' : elKind === 'image' ? 'Replace in Guidelines' : 'Edit in Guidelines'}</a>
        {dsel && (dsel.el || dsel.item !== undefined) ? <button type="button" className="btn" onClick={() => hideSel()}><EyeOff {...I} />Leave out of the PDF</button> : null}
      </div>
    </section>
    <div className="pd3-layers"><LayersPanel block={shown} title={crumbs[0]?.label || 'Section'} sel={dsel} multi={[]} select={(s0) => setDsel(s0)}
      hide={(at, hidden) => { if (!hidden) return; const it = shown.items?.[at.i]; hideSel(at.el && it ? { block: shown.id, item: at.i, el: `${it.id}.${at.el}` } : { block: shown.id, item: at.i }); }}
      rename={() => setMsg('Layer names come from the guidelines. Rename them there.')}
      move={(from, to) => { if (from.el !== undefined || to.el !== undefined || to.pos === 'inside') { setMsg('Moving things between frames changes the guidelines, so do it there.'); return; } const l = [...(shown.items || [])]; const [x] = l.splice(from.i, 1); const at = Math.max(0, Math.min(l.length, to.i - (from.i < to.i ? 1 : 0) + (to.pos === 'after' ? 1 : 0))); l.splice(at, 0, x); editBlock(shown.id, { items: l }); setDsel({ block: shown.id, item: at }); }} /></div>
    <section className="pd2-sec pd3-changes" aria-label="Changed in this PDF">
      <p className="pd2-h">Changed in this PDF{entries.length ? <span className="pd3-n">{entries.length}</span> : null}{entries.length ? <button type="button" className="pd2-reset" onClick={() => setBlockOv(undefined)} aria-label="Reset this slide’s formatting to the guidelines" title="Reset the whole slide to the guidelines"><RotateCcw {...I} size={13} /></button> : null}</p>
      {!entries.length ? <p className="pd2-note">Nothing yet: this slide looks exactly like the guidelines. Anything you change below is marked here (and with a pink dot on the slide), and can be put back.</p> : <>
        {mine.length ? <ul className="pd3-ch">{mine.map(chEntry)}</ul> : <p className="pd2-note">The selection follows the guidelines.</p>}
        {others.length ? <details className="pd3-more"><summary>{others.length} more on this slide</summary><ul className="pd3-ch">{others.map(chEntry)}</ul></details> : null}
      </>}
    </section>
    <Inspector sel={dsel} setSel={setDsel} ch={{ ...curCh, blocks: [shown] }} colours={colours} editBlock={editBlock} pickImage={linkedMsg} sys={sys} setSys={setSys}
      openStyles={() => setTab('doc')} onDelete={() => hideSel()} fonts={fontsTb} />
    {cfg.space && Object.keys(cfg.space).length ? <p className="pd2-note" style={{ padding: '0 16px 16px' }}>Spacing rules changed for the PDF are in Document. <button type="button" className="pd3-lnk" onClick={() => save({ ...cfg, space: {} })}>Use the guidelines’ spacing</button></p> : null}
  </div>;

  const slideTab = <>
    <section className="pd2-sec" aria-label="This slide">
      <p className="pd2-h">{cur.kind === 'title' ? 'Title slide' : cur.kind === 'divider' ? `Chapter ${cur.n} divider` : cur.label}</p>
      {cur.kind === 'section' ? <p className="pd2-note">The header (label, headline, introduction) sits above the hang line; the body hangs from it. Select anything on the slide to format it in Design.</p>
        : <p className="pd2-note">{cur.kind === 'title' ? 'These words are only in the PDF. Click them on the slide to change them.' : 'Click the chapter name or introduction on the slide to change them for the PDF only.'}</p>}
      {cur.kind === 'divider' && cfg.dividers?.[cur.chapter] && (cfg.dividers[cur.chapter].title || cfg.dividers[cur.chapter].intro) ? <button type="button" className="btn" onClick={() => { const d = { ...(cfg.dividers || {}) }; delete d[cur.chapter]; save({ ...cfg, dividers: d }); }}>Use the chapter’s own words</button> : null}
      {skipKey ? <label className="pd2-check"><input type="checkbox" checked={!skip.has(skipKey)} onChange={() => toggleSkip(skipKey)} />{cur.kind === 'divider' ? 'Include this chapter in the PDF' : 'Include this slide in the PDF'}</label> : null}
    </section>
    <section className="pd2-sec" aria-label="Position">
      <p className="pd2-h">Position</p>
      <Row label="Align" over={has('align')} onReset={() => clear('align')}>{alignSeg(L.align, (v) => setOv({ align: v }))}</Row>
      {cur.kind !== 'section' ? <Row label="Words sit" over={has('valign')} onReset={() => clear('valign')}>{vSeg(L.valign, (v) => setOv({ valign: v }))}</Row> : null}
      <Row label={cur.kind === 'section' ? 'Header' : 'Headline'} over={has('head')} onReset={() => clear('head')}><SpanPick value={spec.head} cols={cfg.grid.cols} set={(v) => setOv({ head: v })} label="Header columns" /></Row>
      <Row label="Body" over={has('body')} onReset={() => clear('body')}><SpanPick value={spec.body} cols={cfg.grid.cols} set={(v) => setOv({ body: v })} label="Body columns" /></Row>
      <p className="pd2-note">Columns count across the grid, 1 to {cfg.grid.cols}. {cur.kind === 'section' ? 'The section’s frames stretch across the body’s columns.' : 'Headline and text side by side when their columns don’t meet.'}</p>
    </section>
    {spec.canBleed ? <section className="pd2-sec" aria-label="Picture">
      <p className="pd2-h">Picture</p>
      <Row label="Bleed" over={has('bleed')} onReset={() => clear('bleed')}><label className="pd2-check"><input type="checkbox" checked={spec.bleed} onChange={(e) => setOv({ bleed: e.target.checked })} />{shown?.kind === 'split' ? 'Run its half off the edges' : 'Fill the slide'}</label></Row>
      {spec.bleed ? <>
        {imgs.length > 1 ? <Pics label="Which picture" none={false} value={feature?.path} pics={imgs.filter((m) => allUrls[m.path]).map((m) => ({ path: m.path, url: allUrls[m.path] }))} set={(p) => setOv({ pick: imgs.findIndex((m) => m.path === p) || undefined })} /> : null}
        <Row label="Fit" over={has('mediaFit')} onReset={() => clear('mediaFit')}>{fitSeg(spec.mediaFit || (feature?.kind === 'graphic' ? 'contain' : 'cover'), (v) => setOv({ mediaFit: v }))}</Row>
        {feature && allUrls[feature.path] ? <><Row label="Focal point" over={has('mediaFocus')} onReset={() => clear('mediaFocus')}><span className="pd2-note">{spec.mediaFocus[0]}% · {spec.mediaFocus[1]}%</span></Row>
          <Focus url={allUrls[feature.path]} value={spec.mediaFocus} set={(v) => setOv({ mediaFocus: v })} /></> : null}
      </> : null}
    </section> : null}
    <section className="pd2-sec" aria-label="Colour and background">
      <p className="pd2-h">Colour and background</p>
      <Row label="Background" over={has('bg')} onReset={() => clear('bg')}><Swatches value={L.bg} colours={colours} set={(h) => setOv({ bg: h })} label="Background colour" /></Row>
      <Row label="Text" over={has('ink')} onReset={() => clear('ink')}><Swatches value={L.ink} colours={colours} set={(h) => setOv({ ink: h })} label="Text colour" /></Row>
      <Row label="Picture" over={has('image')} onReset={() => clear('image')}><span className="pd2-note">{L.image ? 'Behind the slide' : 'None'}</span></Row>
      <Pics label="Background picture" value={L.image} pics={withCurrent(L.image)} set={(p) => setOv({ image: p })} onUpload={async (f) => { const p = await upload(f); if (p) setOv({ image: p }); }} />
      {L.image ? <>
        <Row label="Fit" over={has('fit')} onReset={() => clear('fit')}>{fitSeg(L.fit, (v) => setOv({ fit: v }))}</Row>
        <Row label="Tint" over={has('dim')} onReset={() => clear('dim')}><input className="pd2-range" type="range" min={0} max={90} step={5} value={L.dim} onChange={(e) => setOv({ dim: Number(e.target.value) })} aria-label="Background colour over the picture, in percent" /></Row>
        {allUrls[L.image] ? <><Row label="Focal point" over={has('focus')} onReset={() => clear('focus')}><span className="pd2-note">{L.focus[0]}% · {L.focus[1]}%</span></Row><Focus url={allUrls[L.image]} value={L.focus} set={(v) => setOv({ focus: v })} /></> : null}
      </> : null}
    </section>
    <section className="pd2-sec" aria-label="On the slide">
      <p className="pd2-h">On the slide</p>
      {cur.kind !== 'title' ? <Row label="Header" over={has('header')} onReset={() => clear('header')}><label className="pd2-check"><input type="checkbox" checked={L.header} onChange={(e) => setOv({ header: e.target.checked })} />Chapter name</label></Row> : null}
      {cur.kind !== 'title' ? <Row label="Page no." over={has('pageNumber')} onReset={() => clear('pageNumber')}><label className="pd2-check"><input type="checkbox" checked={L.pageNumber} onChange={(e) => setOv({ pageNumber: e.target.checked })} />Page number</label></Row> : null}
      <Row label="Logo" over={has('logo')} onReset={() => clear('logo')}><select className="pd2-in" value={L.logo} onChange={(e) => setOv({ logo: e.target.value as LogoPlace })} aria-label="Logo position">{logoOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Row>
      {L.logo !== 'none' && logos.length ? <Row label="Logo file" over={has('logoFile')} onReset={() => clear('logoFile')}>{logoPick(ov.logoFile, (k) => setOv({ logoFile: k }), 'Logo file for this slide', `Document’s: ${slideLogo && !ov.logoFile ? slideLogo.name : 'automatic'}`)}</Row> : null}
      {L.logo !== 'none' && !logos.length ? <p className="pd2-note">No logo files in the kit yet. Add them under assets/logo in Resources.</p> : null}
    </section>
    <div className="pd2-foot">
      <button type="button" className="btn" disabled={!Object.keys(ov).length} onClick={() => { const slides = { ...cfg.slides }; delete slides[cur.id]; save({ ...cfg, slides }); }}><RotateCcw {...I} />Reset this slide</button>
      <button type="button" className="btn" onClick={() => setTab('doc')}>Edit {kindName} defaults</button>
    </div>
  </>;

  const margin = (k: keyof PdfSettings['margins']) => <Num key={k} label={k[0].toUpperCase() + k.slice(1)} value={cfg.margins[k]} min={0} max={k === 'left' || k === 'right' ? 600 : 400} step={8} set={(n) => {
    const m = { ...cfg.margins, [k]: n };
    if (linked) { if (k === 'left' || k === 'right') { m.left = n; m.right = n; } else { m.top = n; m.bottom = n; } }
    save({ ...cfg, margins: m });
  }} />;
  const caseSeg = (v: PdfCase, set: (x: PdfCase) => void) => <Seg value={v} set={set} label="Case" opts={[['none', 'Aa', 'As written'], ['upper', 'AA', 'Capitals'], ['lower', 'aa', 'Lower case'], ['sentence', 'Ab.', 'Sentence case'], ['title', 'Ab', 'Title case'], ['smallcaps', 'Sc', 'Small capitals']]} />;
  const kindBlock = (k: 'title' | 'divider' | 'section', name: string) => { const l = lookOf(k); return <div className="pd2-kind" key={k}>
    <h4>{name}</h4>
    <Row label="Background"><Swatches value={l.bg} colours={colours} set={(h) => setKind(k, { bg: h })} label={`${name} background`} /></Row>
    <Row label="Text"><Swatches value={l.ink} colours={colours} set={(h) => setKind(k, { ink: h })} label={`${name} text colour`} /></Row>
    <Row label="Align">{alignSeg(l.align, (v) => setKind(k, { align: v }))}</Row>
    {k !== 'section' ? <Row label="Words sit">{vSeg(l.valign, (v) => setKind(k, { valign: v }))}</Row> : null}
    <Row label="Logo"><select className="pd2-in" value={l.logo} onChange={(e) => setKind(k, { logo: e.target.value as LogoPlace })} aria-label={`${name} logo`}>{logoOpts.map(([x, t]) => <option key={x} value={x}>{t}</option>)}</select></Row>
    {k !== 'title' ? <Row label="Show"><div style={{ display: 'grid', gap: 4 }}>
      <label className="pd2-check"><input type="checkbox" checked={l.header} onChange={(e) => setKind(k, { header: e.target.checked })} />Chapter name</label>
      <label className="pd2-check"><input type="checkbox" checked={l.pageNumber} onChange={(e) => setKind(k, { pageNumber: e.target.checked })} />Page numbers</label>
      {k === 'divider' ? <><label className="pd2-check"><input type="checkbox" checked={cfg.divider.number} onChange={(e) => setKind('divider', { number: e.target.checked })} />Chapter number</label>
        <label className="pd2-check"><input type="checkbox" checked={cfg.divider.intro} onChange={(e) => setKind('divider', { intro: e.target.checked })} />Introduction</label></> : null}
    </div></Row> : null}
    {k !== 'section' ? <><Row label="Picture"><span className="pd2-note">{l.image ? 'Behind every ' + (k === 'title' ? 'title' : 'divider') : 'None'}</span></Row>
      <Pics label={`${name} background picture`} value={l.image} pics={withCurrent(l.image)} set={(p) => setKind(k, { image: p || undefined })} onUpload={async (f) => { const p = await upload(f); if (p) setKind(k, { image: p }); }} />
      {l.image ? <Row label="Tint"><input className="pd2-range" type="range" min={0} max={90} step={5} value={l.dim} onChange={(e) => setKind(k, { dim: Number(e.target.value) })} aria-label={`${name}: background colour over the picture, in percent`} /></Row> : null}</> : null}
  </div>; };
  const autoMain = logos.find((l) => !l.light) || logos[0], autoLight = logos.find((l) => l.light);

  const docTab = <>
    <section className="pd2-sec" aria-label="Grid">
      <p className="pd2-h">Grid</p>
      <div className="pd2-ins"><Num label="Columns" value={cfg.grid.cols} min={1} max={24} set={(n) => save({ ...cfg, grid: { ...cfg.grid, cols: n } })} /><Num label="Gutter" unit="px" value={cfg.grid.gutter} min={0} max={200} step={4} set={(n) => save({ ...cfg, grid: { ...cfg.grid, gutter: n } })} /></div>
      <div className="pd2-ins x4" style={{ alignItems: 'end' }}>{margin('top')}{margin('right')}{margin('bottom')}{margin('left')}</div>
      <label className="pd2-check"><input type="checkbox" checked={linked} onChange={() => setLinked(!linked)} />{linked ? <Link2 {...I} /> : <Link2Off {...I} />}Opposite margins move together</label>
      <p className="pd2-note">In pixels of a 1920 × 1080 slide. Every slide’s words and pictures sit on these columns.</p>
    </section>
    <section className="pd2-sec" aria-label="Hang lines">
      <p className="pd2-h">Hang lines</p>
      <p className="pd2-note">Every section’s body hangs from the same line, so the deck reads as one. Its header (label, headline, introduction) sits above the line, its last line the header gap above it.</p>
      <Row label="Content"><div className="pd2-ins" style={{ gridTemplateColumns: '1fr 72px', alignItems: 'center' }}><input className="pd2-range" type="range" min={cfg.margins.top} max={SLIDE_H - cfg.margins.bottom - 100} step={4} value={cfg.hang.content} onChange={(e) => save({ ...cfg, hang: { ...cfg.hang, content: Number(e.target.value) } })} aria-label="Content hang line, pixels down the slide" /><Num label="Content hang line" hideLabel value={cfg.hang.content} min={0} max={SLIDE_H} step={4} set={(n) => save({ ...cfg, hang: { ...cfg.hang, content: n } })} /></div></Row>
      <Row label="Header gap"><div className="pd2-ins" style={{ gridTemplateColumns: '1fr 72px', alignItems: 'center' }}><input className="pd2-range" type="range" min={0} max={200} step={4} value={cfg.headerGap} onChange={(e) => save({ ...cfg, headerGap: Number(e.target.value) })} aria-label="Space between the header and the hang line, in pixels" /><Num label="Header gap" hideLabel value={cfg.headerGap} min={0} max={400} step={4} set={(n) => save({ ...cfg, headerGap: n })} /></div></Row>
      <Row label="Dividers"><div className="pd2-ins" style={{ gridTemplateColumns: '1fr 72px', alignItems: 'center' }}><input className="pd2-range" type="range" min={cfg.margins.top} max={SLIDE_H - cfg.margins.bottom - 100} step={4} value={cfg.hang.divider} onChange={(e) => save({ ...cfg, hang: { ...cfg.hang, divider: Number(e.target.value) } })} aria-label="Divider hang line, pixels down the slide" /><Num label="Divider hang line" hideLabel value={cfg.hang.divider} min={0} max={SLIDE_H} step={4} set={(n) => save({ ...cfg, hang: { ...cfg.hang, divider: n } })} /></div></Row>
    </section>
    <section className="pd2-sec" aria-label="Guideline styles">
      <p className="pd2-h">Guideline styles on a slide</p>
      <p className="pd2-note">Sections keep the guidelines’ frames, rules, fills and spacing. This sets how much larger they are on a slide than on the web page.</p>
      <Row label="Scale"><div className="pd2-ins" style={{ gridTemplateColumns: '1fr 72px', alignItems: 'center' }}><input className="pd2-range" type="range" min={0.8} max={3} step={0.05} value={cfg.scale} onChange={(e) => save({ ...cfg, scale: Number(e.target.value) })} aria-label="Scale of the guideline’s frames and spacing" /><Num label="Scale" hideLabel value={cfg.scale} min={0.8} max={3} step={0.05} set={(n) => save({ ...cfg, scale: n })} /></div></Row>
      {Object.keys(cfg.space).length ? <Row label="Spacing"><button type="button" className="btn" onClick={() => save({ ...cfg, space: {} })}><RotateCcw {...I} />Use the guidelines’ spacing rules</button></Row> : null}
    </section>
    <section className="pd2-sec" aria-label="Logo">
      <p className="pd2-h">Logo</p>
      {logos.length ? <>
        <Row label="On light">{logoPick(cfg.logo.main, (k) => save({ ...cfg, logo: { ...cfg.logo, main: k } }), 'Logo on light backgrounds', `Automatic: ${autoMain?.name || 'none'}`)}</Row>
        <Row label="On dark">{logoPick(cfg.logo.light, (k) => save({ ...cfg, logo: { ...cfg.logo, light: k } }), 'Logo on dark backgrounds', `Automatic: ${autoLight?.name || autoMain?.name || 'none'}`)}</Row>
        <div className="pd3-logos">{[['#ffffff', cfg.logo.main], ['#111111', cfg.logo.light]].map(([bg]) => { const l = logoFor(logos, cfg, inkOnHex(bg as string)); return <span key={bg} style={{ background: bg }}>{l ? <img src={l.url} alt={l.name} /> : null}</span>; })}</div>
        <p className="pd2-note">Slides with light text use the dark-background logo. A slide can pick its own in the Slide tab.</p>
      </> : <p className="pd2-note">No logo files in the kit yet. Add them under assets/logo in Resources.</p>}
    </section>
    <section className="pd2-sec" aria-label="Type styles">
      <p className="pd2-h">Type styles{Object.keys(cfg.styles).length ? <button type="button" className="pd2-reset" onClick={() => save({ ...cfg, styles: {} })} aria-label="Reset every style to the guide’s" title="Reset every style to the guide’s"><RotateCcw {...I} size={13} /></button> : null}</p>
      <p className="pd2-note">Every word in the deck is set in one of these. Each starts from the guide’s own style at a slide size, and sets that style wherever the guidelines use it.</p>
      <div className="pd2-styles">{STYLE_IDS.map((id) => { const s = styles[id], edited = !!cfg.styles[id]; const fnt = fonts.find((f) => f.role === s.font); return <details key={id} className="pd2-st">
        <summary><span className="pd2-st-n">{edited ? <span className="pd2-st-ed" aria-label="Changed" /> : null}<b style={{ fontFamily: `var(--font-${s.font}, var(--font))`, fontWeight: s.weight }}>{s.name}</b></span><span className="pd2-st-m">{fnt?.name || s.font} · {s.size}</span></summary>
        <div className="pd2-st-body">
          <p className="pd2-note">{STYLE_USE[id]}</p>
          <select className="pd2-in" value={s.font} onChange={(e) => setStyle(id, { font: e.target.value })} aria-label={`${s.name} typeface`}>
            {fonts.map((f) => <option key={f.role} value={f.role}>{f.name || f.role}</option>)}
            {!fonts.some((f) => f.role === s.font) ? <option value={s.font}>{s.font}</option> : null}
          </select>
          <div className="pd2-ins">
            <Num label="Size" unit="px" value={s.size} min={8} max={400} set={(n) => setStyle(id, { size: n })} />
            <label className="pd2-nf"><span>Weight</span><select className="pd2-in" value={s.weight} onChange={(e) => setStyle(id, { weight: Number(e.target.value) })}>{[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}</select></label>
            <Num label="Leading" unit="%" value={Math.round(s.leading * 100)} min={70} max={250} step={5} set={(n) => setStyle(id, { leading: n / 100 })} />
            <Num label="Tracking" unit="%" value={Math.round(s.tracking * 1000) / 10} min={-20} max={50} step={0.5} set={(n) => setStyle(id, { tracking: n / 100 })} />
          </div>
          {caseSeg(s.case, (v) => setStyle(id, { case: v }))}
          {edited ? <button type="button" className="btn" onClick={() => setStyle(id, null)}><RotateCcw {...I} />Back to the guide’s</button> : null}
        </div>
      </details>; })}</div>
    </section>
    <section className="pd2-sec" aria-label="Slide defaults">
      <p className="pd2-h">Slide defaults</p>
      <p className="pd2-note">Colours and furniture for each kind of slide. A slide can change any of it in the Slide tab.</p>
      {kindBlock('title', 'Title slide')}{kindBlock('divider', 'Dividers')}{kindBlock('section', 'Content slides')}
    </section>
  </>;

  const linkChip = rects.sel && dsel?.el && (elKind === 'text' || elKind === 'image') ? <a className="pd3-chip" href={guideHref(shown?.id)} style={{ left: rects.sel.x, top: Math.max(0, rects.sel.y - 26) }} title="The words and pictures are the guidelines’ own. Change them there and the PDF follows.">
    <Link2 {...I} size={12} />Linked to Guidelines<span>· Edit in Guidelines</span></a> : null;
  const overlay = cur.kind === 'section' ? <div className="pd3-ov" aria-hidden={!linkChip}>
    {rects.marks.map((r, i) => <span key={i} className="pd3-mark" style={{ left: r.x + r.w - 5, top: r.y - 5 }} title="Changed in this PDF" />)}
    {rects.hover && (!rects.sel || rects.hover.x !== rects.sel.x || rects.hover.y !== rects.sel.y || rects.hover.w !== rects.sel.w) ? <span className="pd3-hov" style={{ left: rects.hover.x, top: rects.hover.y, width: rects.hover.w, height: rects.hover.h }} /> : null}
    {rects.sel ? <span className={'pd3-sel' + (dsel?.el ? ' el' : dsel?.item !== undefined ? ' item' : '')} style={{ left: rects.sel.x, top: rects.sel.y, width: rects.sel.w, height: rects.sel.h }} /> : null}
    {linkChip}
  </div> : null;

  return <div className="pd2-root">
    <style dangerouslySetInnerHTML={{ __html: fontCss + '\n' + typeCss + '\n' + guideCss }} />
    <div className="pd2-bar">
      <div className="pd2-bar-l">
        <p className="mute">{included.length} slides at 16:9</p>
        <span className="pd2-status" role="status">{msg}</span>
      </div>
      <button type="button" className="pd2-tog" aria-pressed={show.grid} onClick={() => toggle('grid')}><Grid3x3 {...I} />Grid</button>
      <button type="button" className="pd2-tog" aria-pressed={show.hang} onClick={() => toggle('hang')}><SeparatorHorizontal {...I} />Hang line</button>
      <button type="button" className="btn solid" onClick={exportPdf} disabled={printing}>{printing ? <Loader2 {...I} className="spin" /> : <Download {...I} />}Export PDF</button>
    </div>
    <div className="pd2-ui">
      <nav className="pd2-film" aria-label="Slides" onKeyDown={filmKey}>
        {all.map((s) => { const off = s.page === 0; const ch = s.kind === 'divider' ? s.label : null; const changed = !!cfg.slides[s.id]?.block; return <div key={s.id}>
          {ch ? <p className="pd2-chap">{String((s as { n: number }).n).padStart(2, '0')} {ch}</p> : null}
          <div className={'pd2-th' + (s.id === cur.id ? ' on' : '') + (off ? ' off' : '')}>
            <button type="button" className="pd2-th-b" data-th={s.id} tabIndex={s.id === cur.id ? 0 : -1} onClick={() => setSel(s.id)} aria-current={s.id === cur.id ? 'true' : undefined} aria-label={`${s.kind === 'title' ? 'Title slide' : s.kind === 'divider' ? 'Divider: ' + s.label : s.label}${off ? ', left out' : `, page ${s.page}`}${changed ? ', formatting changed for the PDF' : ''}`}>
              <span className="pd2-th-n">{off ? '–' : s.page}</span>
              <span className="pd2-th-pv"><SlideBox width={156}><Slide s={s} ctx={ctx} /></SlideBox>{changed ? <i className="pd3-th-ch" title="Formatting changed for the PDF" /> : null}</span>
            </button>
            {s.kind !== 'title' ? <button type="button" className="pd2-th-x" onClick={() => toggleSkip(s.kind === 'divider' ? s.chapter : s.block)} aria-label={off ? `Put ${s.label} back in` : `Leave ${s.label} out`} title={off ? 'Put it back in' : s.kind === 'divider' ? 'Leave this chapter out' : 'Leave this slide out'}>{off ? <EyeOff {...I} /> : <Eye {...I} />}</button> : null}
          </div>
        </div>; })}
      </nav>
      <main className="pd2-stage" aria-label="Selected slide">
        <Fit>{(w) => <div ref={boxRef} className={'pd3-stage' + (cur.kind === 'section' ? ' picking' : '')} onMouseDownCapture={onDown} onMouseMove={onMove} onMouseLeave={() => { hoverNode.current = null; setRects((p) => ({ ...p, hover: null })); }}>
          <SlideBox width={w} label={`${cur.label}, slide preview`} guides={{ cfg, hangY: spec.hangY, grid: show.grid, hang: show.hang, headerGap: cur.kind === 'section' ? cfg.headerGap : 0 }} overlay={overlay}><Slide s={cur} ctx={ctx} onWords={cur.kind !== 'section' ? onWords(cur) : undefined} /></SlideBox>
        </div>}</Fit>
        <p className="pd2-cap">
          <span>{cur.kind === 'title' ? 'Title slide' : cur.kind === 'divider' ? `Chapter ${cur.n} divider` : `${curCh?.title} · ${cur.label}`}{cur.page ? ` · page ${cur.page}` : ' · left out'}</span>
          {cur.kind === 'section' ? <span>· Click a section, frame, text or picture to format it. Esc selects the frame or section around it.</span> : null}
          {overflow ? <span className="pd2-warn" role="status">{overflow}</span> : null}
        </p>
      </main>
      <aside className="pd2-insp" aria-label="Inspector">
        <div className="pd2-tabs" role="tablist" aria-label="Settings">
          {cur.kind === 'section' ? <button type="button" role="tab" id="pd2-tab-design" aria-selected={tab === 'design'} aria-controls="pd2-panel" onClick={() => setTab('design')}>Design</button> : null}
          <button type="button" role="tab" id="pd2-tab-slide" aria-selected={tab === 'slide'} aria-controls="pd2-panel" onClick={() => setTab('slide')}>Slide</button>
          <button type="button" role="tab" id="pd2-tab-doc" aria-selected={tab === 'doc'} aria-controls="pd2-panel" onClick={() => setTab('doc')}>Document</button>
        </div>
        <div id="pd2-panel" role="tabpanel" aria-labelledby={`pd2-tab-${tab}`}>{tab === 'design' && cur.kind === 'section' ? designTab : tab === 'doc' ? docTab : slideTab}</div>
      </aside>
    </div>
    {printing ? <div className="pd2-print" aria-hidden>{included.map((s) => <div key={s.id} className="pd2-page"><div className="pd2-page-in"><Slide s={s} ctx={ctx} /></div></div>)}</div> : null}
  </div>;
}

const inkOnHex = (bg: string) => (bg === '#ffffff' ? '#111111' : '#ffffff');

/** The space available for the big slide, in pixels of width: as wide as the column, as tall as the window allows */
function Fit({ children }: { children: (w: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(960);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => { const r = el.getBoundingClientRect(); setW(Math.floor(Math.max(320, Math.min(r.width, (window.innerHeight - 76 - 72) * SLIDE_W / SLIDE_H)))); };
    const ro = new ResizeObserver(fit); ro.observe(el); fit(); window.addEventListener('resize', fit); return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, []);
  return <div ref={ref} className="pd2-fitw">{children(w)}</div>;
}
