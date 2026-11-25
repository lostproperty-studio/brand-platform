'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, Download, Eye, EyeOff, Grid3x3, Link2, Link2Off, Loader2, Lock, RotateCcw, SeparatorHorizontal } from 'lucide-react';
import type { Guide } from '@/lib/portal/guide';
import type { GuideSystem } from '@/lib/guideSystem';
import {
  LAYOUTS, SLIDE_H, SLIDE_W, STYLE_IDS, STYLE_USE, blockImages, readPdf, resolveStyles, defaultStyles, slideSpec,
  type Fit, type Layout, type Look, type LogoPlace, type PdfCase, type PdfSettings, type PdfStyle, type SlideOverrides, type StyleId, type VAlign
} from '@/lib/pdf';
import { Slide, SlideBox, type SlideCtx, type SlideInfo } from '@/components/pdf/Slide';
import { Focus, I, LayoutIcon, Num, Pics, Row, Seg, SpanPick, Swatches } from '@/components/pdf/controls';
import '@/components/pdf/pdf.css';

type Colour = { name: string; hex: string };
type Font = { role: string; name: string };

// The PDF tab: a slide editor for the guidelines as a 16:9 deck. The words and pictures come from the guide and are
// locked here; the studio designs how they sit: a grid and a hang line every slide shares, a set of type styles,
// colours and backgrounds per kind of slide, and a layout, columns, alignment and background per slide. A slide's own
// settings sit over the document's and can be reset. Export prints the slides to a PDF at 16:9 exactly as shown.
export function PdfStudio({ projectId, client, guide, urls, logoUrl, colours, content, fontCss, system, fonts }: {
  projectId: string; client: string; guide: Guide | null; urls: Record<string, string>; logoUrl: string | null; colours: Colour[];
  content: unknown; fontCss: string; system: GuideSystem | null; fonts: Font[];
}) {
  const [cfg, setCfg] = useState<PdfSettings>(() => readPdf(content, colours));
  const [sel, setSel] = useState('title');
  const [tab, setTab] = useState<'slide' | 'doc'>('slide');
  const [printing, setPrinting] = useState(false);
  const [msg, setMsg] = useState('');
  const [added, setAdded] = useState<Record<string, string>>({});
  const [show, setShow] = useState({ grid: true, hang: true });
  const [linked, setLinked] = useState(() => { const m = cfg.margins; return m.left === m.right && m.top === m.bottom; });
  const [overflow, setOverflow] = useState(false);
  const allUrls = useMemo(() => ({ ...urls, ...added }), [urls, added]);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem('pd2-show') || 'null'); if (v && typeof v.grid === 'boolean') setShow(v); } catch { /* the default is fine */ } }, []);
  const toggle = (k: 'grid' | 'hang') => setShow((s) => { const n = { ...s, [k]: !s[k] }; try { localStorage.setItem('pd2-show', JSON.stringify(n)); } catch { /* not kept */ } return n; });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useCallback((next: PdfSettings) => {
    setCfg(next); setMsg('Saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { pdf: next } }) }).then((r) => setMsg(r.ok ? 'Saved' : 'Couldn’t save. Try again.')).catch(() => setMsg('Couldn’t save. Try again.')); }, 600);
  }, [projectId]);
  useEffect(() => { if (msg !== 'Saved') return; const t = setTimeout(() => setMsg(''), 1500); return () => clearTimeout(t); }, [msg]);

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
  const curBlock = cur.kind === 'section' ? curCh?.blocks.find((b) => b.id === cur.block) : undefined;
  const spec = slideSpec(cfg, cur.id, cur.kind, curBlock);
  const ov: SlideOverrides = cfg.slides[cur.id] || {};
  const skipKey = cur.kind === 'divider' ? cur.chapter : cur.kind === 'section' ? cur.block : null;
  const toggleSkip = (id: string) => save({ ...cfg, skip: skip.has(id) ? [...skip].filter((x) => x !== id) : [...skip, id] });

  const styles = resolveStyles(cfg, system);
  const base = useMemo(() => defaultStyles(system), [system]);
  const typeCss = STYLE_IDS.map((id) => { const s = styles[id]; return `.pd2-root .pd2-t-${id}, .pd2-print .pd2-t-${id} { font-family: var(--font-${s.font}, var(--font)); font-size: ${s.size}px; font-weight: ${s.weight}; line-height: ${s.leading}; letter-spacing: ${s.tracking}em; text-transform: ${s.case === 'upper' ? 'uppercase' : s.case === 'lower' ? 'lowercase' : s.case === 'title' ? 'capitalize' : 'none'}; font-variant-caps: ${s.case === 'smallcaps' ? 'all-small-caps' : 'normal'}; }`; }).join('\n');

  // A slide's own settings: set some, or clear them back to the document's
  const setOv = (patch: Partial<SlideOverrides>) => {
    const n: Record<string, unknown> = { ...ov, ...patch };
    for (const k of Object.keys(n)) if (n[k] === undefined) delete n[k];
    const slides = { ...cfg.slides }; if (Object.keys(n).length) slides[cur.id] = n as SlideOverrides; else delete slides[cur.id];
    save({ ...cfg, slides });
  };
  const clear = (...keys: (keyof SlideOverrides)[]) => setOv(Object.fromEntries(keys.map((k) => [k, undefined])));
  const has = (...keys: (keyof SlideOverrides)[]) => keys.some((k) => ov[k] !== undefined);
  const setKind = <K extends 'title' | 'divider' | 'section'>(k: K, v: Partial<PdfSettings[K]>) => save({ ...cfg, [k]: { ...cfg[k], ...v } });
  const setStyle = (id: StyleId, v: Partial<PdfStyle> | null) => {
    const st = { ...cfg.styles };
    if (!v) delete st[id]; else { const n = { ...(st[id] || {}), ...v } as Record<string, unknown>; for (const [k, x] of Object.entries(n)) if (x === (base[id] as Record<string, unknown>)[k]) delete n[k]; if (Object.keys(n).length) st[id] = n as Partial<PdfStyle>; else delete st[id]; }
    save({ ...cfg, styles: st });
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
    await Promise.all(imgs.map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; setTimeout(r, 8000); }))));
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

  const ctx: SlideCtx | null = guide ? { cfg, guide, urls: allUrls, logoUrl, client, total: included.length } : null;
  const onWords = (s: SlideInfo) => (k: string, v: string) => {
    if (s.kind === 'title') setKind('title', { [k]: v || undefined } as Partial<PdfSettings['title']>);
    if (s.kind === 'divider') save({ ...cfg, dividers: { ...(cfg.dividers || {}), [s.chapter]: { ...(cfg.dividers?.[s.chapter] || {}), [k]: v || undefined } } });
  };

  // Words that run past the bottom margin, so the studio can change the layout or the type
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    const check = () => { const el = stageRef.current?.querySelector<HTMLElement>('.pd2-area'); if (!el || !alive) return; const kids = [...el.children] as HTMLElement[]; const r = el.getBoundingClientRect(); setOverflow(kids.some((k) => { const b = k.getBoundingClientRect(); return b.bottom > r.bottom + 2 || b.top < r.top - 2 })); };
    const t = setTimeout(check, 60); document.fonts?.ready.then(check);
    return () => { alive = false; clearTimeout(t); };
  });

  // The slide list moves with the arrow keys
  const filmKey = (e: React.KeyboardEvent) => {
    const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0; if (!d) return;
    e.preventDefault(); const i = all.findIndex((s) => s.id === cur.id); const n = all[Math.max(0, Math.min(all.length - 1, i + d))];
    setSel(n.id); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-th="${CSS.escape(n.id)}"]`)?.focus());
  };

  if (!guide || !chapters.length || !ctx) return <p className="mute">Build the guidelines first. The PDF is made from them.</p>;

  const lookOf = (kind: 'title' | 'divider' | 'section'): Look => cfg[kind];
  const kindName = cur.kind === 'title' ? 'title slide' : cur.kind === 'divider' ? 'dividers' : 'content slides';
  const L = spec.look;
  const imgs = curBlock ? blockImages(curBlock) : [];
  const feature = imgs[Math.min(spec.pick, Math.max(0, imgs.length - 1))];
  const hasMedia = cur.kind === 'section' && ['text-image', 'image-text', 'image'].includes(spec.layout);
  const hasFrames = cur.kind === 'section' && (spec.layout === 'grid' || spec.layout === 'swatches');
  const logoOpts: [LogoPlace, string][] = [['none', 'No logo'], ['top-left', 'Top left'], ['top-right', 'Top right'], ['centre', 'Centre'], ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right']];
  const alignSeg = (v: Look['align'], set: (x: Look['align']) => void) => <Seg value={v} set={set} label="Alignment" opts={[['left', <AlignLeft key="l" {...I} />, 'Left'], ['centre', <AlignCenter key="c" {...I} />, 'Centre']]} />;
  const vSeg = (v: VAlign, set: (x: VAlign) => void) => <Seg value={v} set={set} label="Vertical position" opts={[['top', 'Top', 'Top margin'], ['hang', 'Hang', 'From the hang line'], ['centre', 'Mid', 'Centre'], ['bottom', 'Base', 'Bottom margin']]} />;
  const fitSeg = (v: Fit, set: (x: Fit) => void) => <Seg value={v} set={set} label="Fit" opts={[['cover', 'Fill'], ['contain', 'Fit']]} />;

  const slideTab = <>
    <section className="pd2-sec" aria-label="This slide">
      <p className="pd2-h">{cur.kind === 'title' ? 'Title slide' : cur.kind === 'divider' ? `Chapter ${cur.n} divider` : cur.label}</p>
      {cur.kind === 'section' ? <p className="pd2-lock"><Lock {...I} size={13} /><span>The words and pictures come from the guidelines, so they stay the same everywhere. <a href={`/studio/projects/${projectId}?tab=guidelines`}>Edit in guidelines</a></span></p>
        : <p className="pd2-note">{cur.kind === 'title' ? 'These words are only in the PDF. Click them on the slide to change them.' : 'Click the chapter name or introduction on the slide to change them for the PDF only.'}</p>}
      {cur.kind === 'divider' && cfg.dividers?.[cur.chapter] && (cfg.dividers[cur.chapter].title || cfg.dividers[cur.chapter].intro) ? <button type="button" className="btn" onClick={() => { const d = { ...(cfg.dividers || {}) }; delete d[cur.chapter]; save({ ...cfg, dividers: d }); }}>Use the chapter’s own words</button> : null}
      {skipKey ? <label className="pd2-check"><input type="checkbox" checked={!skip.has(skipKey)} onChange={() => toggleSkip(skipKey)} />{cur.kind === 'divider' ? 'Include this chapter in the PDF' : 'Include this slide in the PDF'}</label> : null}
    </section>
    {cur.kind === 'section' ? <section className="pd2-sec" aria-label="Layout">
      <p className="pd2-h">Layout{has('layout') ? <button type="button" className="pd2-reset" onClick={() => clear('layout', 'head', 'body', 'media', 'bleed', 'up')} aria-label="Back to the automatic layout" title="Back to the automatic layout"><RotateCcw {...I} size={13} /></button> : null}</p>
      <div className="pd2-layouts" role="radiogroup" aria-label="Layout">
        {LAYOUTS.map((l) => <button key={l.id} type="button" role="radio" className="pd2-lay" aria-checked={spec.layout === l.id} onClick={() => setOv({ layout: l.id === spec.auto ? undefined : l.id, head: undefined, body: undefined, media: undefined, bleed: undefined, up: undefined })}>
          <LayoutIcon id={l.id} />{l.name}{l.id === spec.auto ? <em>Auto</em> : null}</button>)}
      </div>
    </section> : null}
    <section className="pd2-sec" aria-label="Position">
      <p className="pd2-h">Position</p>
      <Row label="Align" over={has('align')} onReset={() => clear('align')}>{alignSeg(L.align, (v) => setOv({ align: v }))}</Row>
      <Row label="Words sit" over={has('valign')} onReset={() => clear('valign')}>{vSeg(L.valign, (v) => setOv({ valign: v }))}</Row>
      <Row label="Headline" over={has('head')} onReset={() => clear('head')}><SpanPick value={spec.zones.head} cols={cfg.grid.cols} set={(v) => setOv({ head: v })} label="Headline columns" /></Row>
      <Row label="Text" over={has('body')} onReset={() => clear('body')}><SpanPick value={spec.zones.body} cols={cfg.grid.cols} set={(v) => setOv({ body: v })} label="Text columns" /></Row>
      {hasMedia || hasFrames ? <Row label={hasFrames ? 'Frames' : 'Picture'} over={has('media')} onReset={() => clear('media')}><SpanPick value={spec.zones.media} cols={cfg.grid.cols} set={(v) => setOv({ media: v })} label={hasFrames ? 'Frame columns' : 'Picture columns'} /></Row> : null}
      {hasMedia ? <Row label="Bleed" over={has('bleed')} onReset={() => clear('bleed')}><label className="pd2-check"><input type="checkbox" checked={spec.zones.bleed} onChange={(e) => setOv({ bleed: e.target.checked })} />Run off the edges</label></Row> : null}
      {hasFrames ? <Row label="Per row" over={has('up')} onReset={() => clear('up')}><Num label="Frames per row" hideLabel value={spec.zones.up} min={1} max={8} set={(n) => setOv({ up: n })} /></Row> : null}
      <p className="pd2-note">Columns count across the grid, 1 to {cfg.grid.cols}. Headline and text side by side when their columns don’t meet, one under the other when they do.</p>
    </section>
    {hasMedia || (hasFrames && spec.layout === 'grid') ? <section className="pd2-sec" aria-label="Picture">
      <p className="pd2-h">Picture</p>
      {hasMedia && imgs.length > 1 ? <Pics label="Which picture" none={false} value={feature?.path} pics={imgs.filter((m) => allUrls[m.path]).map((m) => ({ path: m.path, url: allUrls[m.path] }))} set={(p) => setOv({ pick: imgs.findIndex((m) => m.path === p) || undefined })} /> : null}
      <Row label="Fit" over={has('mediaFit')} onReset={() => clear('mediaFit')}>{fitSeg(spec.mediaFit || (feature?.kind === 'graphic' ? 'contain' : 'cover'), (v) => setOv({ mediaFit: v }))}</Row>
      {hasMedia && feature && allUrls[feature.path] ? <><Row label="Focal point" over={has('mediaFocus')} onReset={() => clear('mediaFocus')}><span className="pd2-note">{spec.mediaFocus[0]}% · {spec.mediaFocus[1]}%</span></Row>
        <Focus url={allUrls[feature.path]} value={spec.mediaFocus} set={(v) => setOv({ mediaFocus: v })} /></> : null}
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
      <Row label="Logo" over={has('logo')} onReset={() => clear('logo')}><select className="pd2-in" value={L.logo} onChange={(e) => setOv({ logo: e.target.value as LogoPlace })} aria-label="Logo">{logoOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Row>
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
  const caseSeg = (v: PdfCase, set: (x: PdfCase) => void) => <Seg value={v} set={set} label="Case" opts={[['none', 'Aa', 'As written'], ['upper', 'AA', 'Capitals'], ['lower', 'aa', 'Lower case'], ['title', 'Ab', 'Title case'], ['smallcaps', 'Sc', 'Small capitals']]} />;
  const kindBlock = (k: 'title' | 'divider' | 'section', name: string) => { const l = lookOf(k); return <div className="pd2-kind" key={k}>
    <h4>{name}</h4>
    <Row label="Background"><Swatches value={l.bg} colours={colours} set={(h) => setKind(k, { bg: h })} label={`${name} background`} /></Row>
    <Row label="Text"><Swatches value={l.ink} colours={colours} set={(h) => setKind(k, { ink: h })} label={`${name} text colour`} /></Row>
    <Row label="Align">{alignSeg(l.align, (v) => setKind(k, { align: v }))}</Row>
    <Row label="Words sit">{vSeg(l.valign, (v) => setKind(k, { valign: v }))}</Row>
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
      <p className="pd2-note">Headlines hang from the same line on every slide, so the deck reads as one. The tops of the capitals sit on it.</p>
      <Row label="Content"><div className="pd2-ins" style={{ gridTemplateColumns: '1fr 72px', alignItems: 'center' }}><input className="pd2-range" type="range" min={cfg.margins.top} max={SLIDE_H - cfg.margins.bottom - 100} step={4} value={cfg.hang.content} onChange={(e) => save({ ...cfg, hang: { ...cfg.hang, content: Number(e.target.value) } })} aria-label="Content hang line, pixels down the slide" /><Num label="Content hang line" hideLabel value={cfg.hang.content} min={0} max={SLIDE_H} step={4} set={(n) => save({ ...cfg, hang: { ...cfg.hang, content: n } })} /></div></Row>
      <Row label="Dividers"><div className="pd2-ins" style={{ gridTemplateColumns: '1fr 72px', alignItems: 'center' }}><input className="pd2-range" type="range" min={cfg.margins.top} max={SLIDE_H - cfg.margins.bottom - 100} step={4} value={cfg.hang.divider} onChange={(e) => save({ ...cfg, hang: { ...cfg.hang, divider: Number(e.target.value) } })} aria-label="Divider hang line, pixels down the slide" /><Num label="Divider hang line" hideLabel value={cfg.hang.divider} min={0} max={SLIDE_H} step={4} set={(n) => save({ ...cfg, hang: { ...cfg.hang, divider: n } })} /></div></Row>
    </section>
    <section className="pd2-sec" aria-label="Type styles">
      <p className="pd2-h">Type styles{Object.keys(cfg.styles).length ? <button type="button" className="pd2-reset" onClick={() => save({ ...cfg, styles: {} })} aria-label="Reset every style to the guide’s" title="Reset every style to the guide’s"><RotateCcw {...I} size={13} /></button> : null}</p>
      <p className="pd2-note">Every word in the deck is set in one of these. They start from the guide’s own styles.</p>
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

  return <div className="pd2-root">
    <style dangerouslySetInnerHTML={{ __html: fontCss + '\n' + typeCss }} />
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
        {all.map((s) => { const off = s.page === 0; const ch = s.kind === 'divider' ? s.label : null; return <div key={s.id}>
          {ch ? <p className="pd2-chap">{String((s as { n: number }).n).padStart(2, '0')} {ch}</p> : null}
          <div className={'pd2-th' + (s.id === cur.id ? ' on' : '') + (off ? ' off' : '')}>
            <button type="button" className="pd2-th-b" data-th={s.id} tabIndex={s.id === cur.id ? 0 : -1} onClick={() => setSel(s.id)} aria-current={s.id === cur.id ? 'true' : undefined} aria-label={`${s.kind === 'title' ? 'Title slide' : s.kind === 'divider' ? 'Divider: ' + s.label : s.label}${off ? ', left out' : `, page ${s.page}`}`}>
              <span className="pd2-th-n">{off ? '–' : s.page}</span>
              <span className="pd2-th-pv"><SlideBox width={156}><Slide s={s} ctx={ctx} /></SlideBox></span>
            </button>
            {s.kind !== 'title' ? <button type="button" className="pd2-th-x" onClick={() => toggleSkip(s.kind === 'divider' ? s.chapter : s.block)} aria-label={off ? `Put ${s.label} back in` : `Leave ${s.label} out`} title={off ? 'Put it back in' : s.kind === 'divider' ? 'Leave this chapter out' : 'Leave this slide out'}>{off ? <EyeOff {...I} /> : <Eye {...I} />}</button> : null}
          </div>
        </div>; })}
      </nav>
      <main className="pd2-stage" aria-label="Selected slide" ref={stageRef}>
        <Fit>{(w) => <SlideBox width={w} label={`${cur.label}, slide preview`} guides={{ cfg, hangY: spec.hangY, grid: show.grid, hang: show.hang }}><Slide s={cur} ctx={ctx} onWords={cur.kind !== 'section' ? onWords(cur) : undefined} /></SlideBox>}</Fit>
        <p className="pd2-cap">
          <span>{cur.kind === 'title' ? 'Title slide' : cur.kind === 'divider' ? `Chapter ${cur.n} divider` : `${curCh?.title} · ${cur.label}`}{cur.page ? ` · page ${cur.page}` : ' · left out'}</span>
          {cur.kind === 'section' ? <span>· {LAYOUTS.find((l) => l.id === spec.layout)?.name}{spec.layout === spec.auto ? ' (auto)' : ''}</span> : null}
          {overflow ? <span className="pd2-warn" role="status">Runs past the margin: try another layout, wider columns or smaller type</span> : null}
        </p>
      </main>
      <aside className="pd2-insp" aria-label="Inspector">
        <div className="pd2-tabs" role="tablist" aria-label="Settings">
          <button type="button" role="tab" id="pd2-tab-slide" aria-selected={tab === 'slide'} aria-controls="pd2-panel" onClick={() => setTab('slide')}>Slide</button>
          <button type="button" role="tab" id="pd2-tab-doc" aria-selected={tab === 'doc'} aria-controls="pd2-panel" onClick={() => setTab('doc')}>Document</button>
        </div>
        <div id="pd2-panel" role="tabpanel" aria-labelledby={tab === 'slide' ? 'pd2-tab-slide' : 'pd2-tab-doc'}>{tab === 'slide' ? slideTab : docTab}</div>
      </aside>
    </div>
    {printing ? <div className="pd2-print" aria-hidden>{included.map((s) => <div key={s.id} className="pd2-page"><div className="pd2-page-in"><Slide s={s} ctx={ctx} /></div></div>)}</div> : null}
  </div>;
}

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
