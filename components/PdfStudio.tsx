'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, Download, Eye, EyeOff, ImagePlus, Link2, Link2Off, Loader2, Trash2 } from 'lucide-react';
import type { Guide, Block } from '@/lib/portal/guide';
import { GuideBlock } from '@/components/portal/GuideBlock';
import { SLIDE_H, SLIDE_W, readPdf, type LogoPlace, type PdfSettings, type SlideRef } from '@/lib/pdf';

const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;
const PORTAL_W = 1024;
type Colour = { name: string; hex: string };
type S = SlideRef & { id: string; label: string; page: number };

// The PDF tab: the guidelines as 16:9 slides. A title slide, a divider for each chapter and a page for each section,
// each from a template the studio sets here (colours, layout, logo, header, page numbers, margins). Sections render
// exactly as in the portal, scaled to fit inside the margins. Export prints the slides to a PDF at 16:9.
export function PdfStudio({ projectId, client, guide, urls, logoUrl, colours, content, sysCss, fontCss }: {
  projectId: string; client: string; guide: Guide | null; urls: Record<string, string>; logoUrl: string | null; colours: Colour[];
  content: unknown; sysCss: string; fontCss: string;
}) {
  const [cfg, setCfg] = useState<PdfSettings>(() => readPdf(content, colours));
  const [sel, setSel] = useState('title');
  const [printing, setPrinting] = useState(false);
  const [msg, setMsg] = useState('');
  const [bgUrl, setBgUrl] = useState<string | null>(cfg.title.image ? urls[cfg.title.image] || null : null);
  const [linked, setLinked] = useState(() => { const m = cfg.margins; return m.left === m.right && m.top === m.bottom; });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useCallback((next: PdfSettings) => {
    setCfg(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { pdf: next } }) }).then((r) => setMsg(r.ok ? 'Saved' : 'Couldn’t save. Try again.')).catch(() => setMsg('Couldn’t save. Try again.')); }, 600);
  }, [projectId]);
  useEffect(() => { if (msg !== 'Saved') return; const t = setTimeout(() => setMsg(''), 1500); return () => clearTimeout(t); }, [msg]);
  const set = <K extends 'title' | 'divider' | 'section'>(k: K, v: Partial<PdfSettings[K]>) => save({ ...cfg, [k]: { ...cfg[k], ...v } });

  const chapters = (guide?.chapters || []).filter((c) => !c.removed && !c.hidden);
  const skip = new Set(cfg.skip || []);
  // Every slide, in order, with page numbers for the ones that go in
  const all: S[] = useMemo(() => {
    const out: S[] = [{ kind: 'title', id: 'title', label: 'Title', page: 0 }];
    chapters.forEach((c, n) => {
      out.push({ kind: 'divider', chapter: c.id, n: n + 1, id: 'd:' + c.id, label: c.title, page: 0 });
      for (const b of c.blocks) if (!b.hidden && b.draft !== 'draft' && b.kind !== 'cover' && b.kind !== 'divider' && b.kind !== 'spacer') out.push({ kind: 'section', chapter: c.id, block: b.id, id: 's:' + b.id, label: (b.heading || b.eyebrow || 'Section').replace(/\s+/g, ' ').slice(0, 48), page: 0 });
    });
    let p = 1; for (const s of out) { const off = s.kind !== 'title' && (skip.has(s.chapter) || (s.kind === 'section' && skip.has(s.block))); s.page = off ? 0 : p++; }
    return out;
  }, [guide, cfg.skip]); // eslint-disable-line react-hooks/exhaustive-deps
  const included = all.filter((s) => s.page > 0);
  const cur = all.find((s) => s.id === sel) || all[0];
  const toggleSkip = (id: string) => save({ ...cfg, skip: skip.has(id) ? [...skip].filter((x) => x !== id) : [...skip, id] });

  async function exportPdf() {
    setPrinting(true); setMsg('Getting the slides ready…');
    // Wait for the print copy to render, its pictures to load and the fonts to be ready
    await new Promise((r) => setTimeout(r, 120));
    await document.fonts?.ready;
    const imgs = [...document.querySelectorAll<HTMLImageElement>('.pdf-print img')];
    await Promise.all(imgs.map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; setTimeout(r, 8000); }))));
    await new Promise((r) => setTimeout(r, 300));
    const was = document.title; document.title = `${client} brand guidelines`;
    setMsg('');
    window.print();
    document.title = was; setPrinting(false);
  }
  async function uploadBg(f?: File) {
    if (!f) return;
    setMsg('Uploading…');
    const fd = new FormData(); fd.set('file', f);
    const r = await fetch(`/api/projects/${projectId}/guide/upload`, { method: 'POST', body: fd }); const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'The upload didn’t go through.'); return; }
    setBgUrl(j.url); set('title', { image: j.path }); setMsg('');
  }

  const slide = (s: S, editable = false) => <Slide key={s.id} s={s} cfg={cfg} guide={guide} urls={urls} logoUrl={logoUrl} client={client} bgUrl={bgUrl} total={included.length}
    onText={editable ? (k, v) => {
      if (s.kind === 'title') set('title', { [k]: v || undefined } as Partial<PdfSettings['title']>);
      if (s.kind === 'divider') save({ ...cfg, dividers: { ...(cfg.dividers || {}), [s.chapter]: { ...(cfg.dividers?.[s.chapter] || {}), [k]: v || undefined } } });
    } : undefined} />;

  const swatches = (v: string, on: (hex: string) => void, label: string) => <div className="pdf-sw" role="radiogroup" aria-label={label}>
    {[...colours.map((c) => c.hex), '#ffffff', '#111111'].filter((h, i, a) => a.indexOf(h) === i).slice(0, 12).map((h) => <button key={h} type="button" role="radio" aria-checked={v.toLowerCase() === h.toLowerCase()} className={v.toLowerCase() === h.toLowerCase() ? 'on' : ''} style={{ background: h }} onClick={() => on(h)} aria-label={colours.find((c) => c.hex === h)?.name || h} title={colours.find((c) => c.hex === h)?.name || h} />)}
  </div>;
  const seg = <T extends string>(v: T, opts: [T, React.ReactNode][], on: (x: T) => void, label: string) => <div className="dp-seg" role="radiogroup" aria-label={label}>{opts.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={v === k} className={v === k ? 'on' : ''} onClick={() => on(k)}>{l}</button>)}</div>;
  const logoSel = (v: LogoPlace, on: (x: LogoPlace) => void) => <select className="dp-select" value={v} onChange={(e) => on(e.target.value as LogoPlace)} aria-label="Logo">
    {([['none', 'No logo'], ['top-left', 'Top left'], ['top-right', 'Top right'], ['centre', 'Centre'], ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right']] as const).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
  </select>;
  const row = (label: string, el: React.ReactNode) => <div className="pdf-row"><span>{label}</span>{el}</div>;
  const margin = (k: keyof PdfSettings['margins']) => <label className="pdf-m"><span>{k[0].toUpperCase() + k.slice(1)}</span><input type="number" min={0} max={400} step={8} value={cfg.margins[k]} onChange={(e) => {
    const n = Math.max(0, Math.min(400, Number(e.target.value) || 0)); const m = { ...cfg.margins, [k]: n };
    if (linked) { if (k === 'left' || k === 'right') { m.left = n; m.right = n; } else { m.top = n; m.bottom = n; } }
    save({ ...cfg, margins: m });
  }} /></label>;

  if (!guide || !chapters.length) return <p className="mute">Build the guidelines first. The PDF is made from them.</p>;
  const curChapter = cur.kind !== 'title' ? chapters.find((c) => c.id === cur.chapter) : undefined;

  return <div className="pdf-root pt">
    <style dangerouslySetInnerHTML={{ __html: fontCss + '\n' + sysCss + PRINT_CSS }} />
    <div className="pdf-bar">
      <p className="mute">{included.length} slides at 16:9. Click a slide to set its template; click its words to change them.</p>
      <span className="mute" role="status">{msg}</span>
      <button type="button" className="btn solid" onClick={exportPdf} disabled={printing}>{printing ? <Loader2 {...I} className="spin" /> : <Download {...I} />}Export PDF</button>
    </div>
    <div className="pdf-ui">
      <nav className="pdf-film" aria-label="Slides">
        {all.map((s) => { const off = s.page === 0; return <div key={s.id} className={'pdf-th' + (s.id === cur.id ? ' on' : '') + (off ? ' off' : '') + ' ' + s.kind}>
          <button type="button" className="pdf-th-b" onClick={() => setSel(s.id)} aria-current={s.id === cur.id ? 'true' : undefined} aria-label={`${s.kind === 'title' ? 'Title slide' : s.kind === 'divider' ? 'Chapter ' + s.label : s.label}${off ? ', left out' : ''}`}>
            <span className="pdf-th-n">{off ? '–' : s.page}</span>
            <span className="pdf-th-pv"><SlideBox width={168}>{slide(s)}</SlideBox></span>
          </button>
          {s.kind !== 'title' ? <button type="button" className="pdf-th-x" onClick={() => toggleSkip(s.kind === 'divider' ? s.chapter : s.block)} aria-label={off ? 'Put it back in' : 'Leave it out'} title={off ? 'Put it back in' : s.kind === 'divider' ? 'Leave this chapter out' : 'Leave this section out'}>{off ? <EyeOff {...I} /> : <Eye {...I} />}</button> : null}
        </div>; })}
      </nav>
      <main className="pdf-stage" aria-label="Slide">
        <Fit>{(w) => <SlideBox width={w} guides={cfg.margins}>{slide(cur, true)}</SlideBox>}</Fit>
        <p className="mute pdf-cap">{cur.kind === 'title' ? 'Title slide' : cur.kind === 'divider' ? `Chapter ${cur.n} divider` : `${curChapter?.title} · ${cur.label}`}{cur.page ? ` · page ${cur.page}` : ' · left out'}</p>
      </main>
      <aside className="pdf-insp" aria-label="Template">
        <section><h3>{cur.kind === 'title' ? 'Title slide' : cur.kind === 'divider' ? 'Chapter dividers' : 'Section pages'}</h3>
          <p className="mute">{cur.kind === 'title' ? 'The first slide. Click its words on the slide to change them.' : cur.kind === 'divider' ? 'One before each chapter. Changes here apply to every divider; click a divider’s words to change just that one.' : 'Every section, scaled to fit inside the margins. Changes apply to every section page.'}</p>
        </section>
        {cur.kind === 'title' ? <section>
          {row('Background', swatches(cfg.title.bg, (h) => set('title', { bg: h }), 'Background'))}
          {row('Text', swatches(cfg.title.ink, (h) => set('title', { ink: h }), 'Text colour'))}
          {row('Align', seg(cfg.title.align, [['left', <AlignLeft key="l" {...I} />], ['centre', <AlignCenter key="c" {...I} />]], (v) => set('title', { align: v }), 'Align'))}
          {row('Position', seg(cfg.title.place, [['top', 'Top'], ['centre', 'Centre'], ['bottom', 'Bottom']], (v) => set('title', { place: v }), 'Position'))}
          {row('Logo', logoSel(cfg.title.logo, (v) => set('title', { logo: v })))}
          {row('Picture', <div className="row">{bgUrl ? <button type="button" className="btn" onClick={() => { setBgUrl(null); set('title', { image: undefined }); }}><Trash2 {...I} />Remove</button> : null}<label className="btn"><ImagePlus {...I} />{bgUrl ? 'Replace' : 'Add a background'}<input type="file" accept="image/*" hidden onChange={(e) => { uploadBg(e.target.files?.[0]); e.target.value = ''; }} /></label></div>)}
        </section> : null}
        {cur.kind === 'divider' ? <section>
          {row('Background', swatches(cfg.divider.bg, (h) => set('divider', { bg: h }), 'Background'))}
          {row('Text', swatches(cfg.divider.ink, (h) => set('divider', { ink: h }), 'Text colour'))}
          {row('Align', seg(cfg.divider.align, [['left', <AlignLeft key="l" {...I} />], ['centre', <AlignCenter key="c" {...I} />]], (v) => set('divider', { align: v }), 'Align'))}
          {row('Position', seg(cfg.divider.place, [['top', 'Top'], ['centre', 'Centre'], ['bottom', 'Bottom']], (v) => set('divider', { place: v }), 'Position'))}
          {row('Show', <div className="pdf-checks"><label className="fp-check"><input type="checkbox" checked={cfg.divider.number} onChange={(e) => set('divider', { number: e.target.checked })} />Chapter number</label><label className="fp-check"><input type="checkbox" checked={cfg.divider.intro} onChange={(e) => set('divider', { intro: e.target.checked })} />Introduction</label></div>)}
          {row('Logo', logoSel(cfg.divider.logo, (v) => set('divider', { logo: v })))}
          {cfg.dividers?.[cur.chapter] && (cfg.dividers[cur.chapter].title || cfg.dividers[cur.chapter].intro) ? <button type="button" className="btn" onClick={() => { const d = { ...(cfg.dividers || {}) }; delete d[cur.chapter]; save({ ...cfg, dividers: d }); }}>Use the chapter’s own words</button> : null}
        </section> : null}
        {cur.kind === 'section' ? <section>
          {row('Background', swatches(cfg.section.bg, (h) => set('section', { bg: h }), 'Background'))}
          {row('Text', swatches(cfg.section.ink, (h) => set('section', { ink: h }), 'Text colour'))}
          {row('Content', seg(cfg.section.place, [['top', 'Top'], ['centre', 'Centre']], (v) => set('section', { place: v }), 'Where the content sits'))}
          {row('Show', <div className="pdf-checks"><label className="fp-check"><input type="checkbox" checked={cfg.section.header} onChange={(e) => set('section', { header: e.target.checked })} />Chapter name</label><label className="fp-check"><input type="checkbox" checked={cfg.section.pageNumbers} onChange={(e) => set('section', { pageNumbers: e.target.checked })} />Page numbers</label></div>)}
          {row('Logo', logoSel(cfg.section.logo, (v) => set('section', { logo: v })))}
        </section> : null}
        <section><h3>Margins</h3><p className="mute">Space around the content on every slide, in pixels of a 1920 × 1080 slide. The dashed lines on the slide show them.</p>
          <div className="pdf-ms">{margin('top')}{margin('right')}{margin('bottom')}{margin('left')}
            <button type="button" className={'rm2-ic' + (linked ? ' on' : '')} onClick={() => setLinked(!linked)} aria-pressed={linked} aria-label={linked ? 'Left and right, top and bottom move together' : 'Each side set on its own'} title={linked ? 'Opposite sides move together' : 'Each side on its own'}>{linked ? <Link2 {...I} /> : <Link2Off {...I} />}</button></div>
        </section>
      </aside>
    </div>
    {printing ? <div className="pdf-print" aria-hidden>{included.map((s) => <div key={s.id} className="pdf-page"><div className="pdf-page-in">{slide(s)}</div></div>)}</div> : null}
  </div>;
}

/** Print: one slide per 16:9 page, nothing else */
const PRINT_CSS = `
@media print {
  @page { size: 16in 9in; margin: 0; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .pdf-print, .pdf-print * { visibility: visible !important; }
  .pdf-print { position: absolute !important; left: 0 !important; top: 0 !important; width: 16in; }
  .pdf-page { width: 16in; height: 9in; overflow: hidden; page-break-after: always; break-after: page; position: relative; }
  .pdf-page-in { width: ${SLIDE_W}px; height: ${SLIDE_H}px; zoom: 0.8; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}`;

/** The space available for the big slide, in pixels of width */
function Fit({ children }: { children: (w: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(960);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => { const r = el.getBoundingClientRect(); setW(Math.max(320, Math.min(r.width, (window.innerHeight - r.top - 64) * 16 / 9))); };
    const ro = new ResizeObserver(fit); ro.observe(el); fit(); return () => ro.disconnect();
  }, []);
  return <div ref={ref} className="pdf-fitw">{children(w)}</div>;
}

/** A 1920×1080 slide shown at a given width */
function SlideBox({ width, children, guides }: { width: number; children: React.ReactNode; guides?: PdfSettings['margins'] }) {
  const z = width / SLIDE_W;
  return <div className="pdf-box" style={{ width, height: width * SLIDE_H / SLIDE_W }}>
    <div style={{ width: SLIDE_W, height: SLIDE_H, zoom: z }}>{children}</div>
    {guides ? <span className="pdf-guides" aria-hidden style={{ left: guides.left * z, right: guides.right * z, top: guides.top * z, bottom: guides.bottom * z }} /> : null}
  </div>;
}

/** The logo, in the slide's text colour so it reads on any background */
function Logo({ url, place, ink }: { url: string | null; place: LogoPlace; ink: string }) {
  if (!url || place === 'none') return null;
  const white = parseInt(ink.slice(1, 3), 16) > 200;
  return <img className={'pdf-logo ' + place} src={url} alt="" style={{ filter: white ? 'brightness(0) invert(1)' : 'brightness(0)' }} />;
}

/** Words you can change on the slide itself */
function Words({ value, fallback, onSave, className, tag: Tag = 'p' }: { value?: string; fallback: string; onSave?: (v: string) => void; className: string; tag?: 'p' | 'h1' | 'h2' }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (ref.current && document.activeElement !== ref.current) ref.current.innerText = value || fallback; }, [value, fallback]);
  if (!onSave) return <Tag className={className}>{value || fallback}</Tag>;
  return <Tag ref={ref as never} className={className + ' pdf-ed'} contentEditable suppressContentEditableWarning spellCheck={false}
    onBlur={(e) => { const v = (e.currentTarget as HTMLElement).innerText.trim(); if (v !== (value || fallback)) onSave(v === fallback ? '' : v); }}
    onKeyDown={(e) => { if (e.key === 'Escape') (e.currentTarget as HTMLElement).blur(); }} />;
}

/** One slide, from its template */
function Slide({ s, cfg, guide, urls, logoUrl, client, bgUrl, total, onText }: {
  s: S; cfg: PdfSettings; guide: Guide | null; urls: Record<string, string>; logoUrl: string | null; client: string; bgUrl: string | null; total: number;
  onText?: (key: string, v: string) => void;
}) {
  const m = cfg.margins;
  const pad = { paddingTop: m.top, paddingRight: m.right, paddingBottom: m.bottom, paddingLeft: m.left };
  if (s.kind === 'title') {
    const t = cfg.title;
    const year = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return <div className={`pdf-s pdf-title al-${t.align} pl-${t.place}`} style={{ background: t.bg, color: t.ink, ...pad }}>
      {bgUrl ? <img className="pdf-bg" src={bgUrl} alt="" /> : null}
      <Logo url={logoUrl} place={t.logo} ink={t.ink} />
      <div className="pdf-tt">
        <Words tag="h1" className="pdf-h1" value={t.heading} fallback={client} onSave={onText ? (v) => onText('heading', v) : undefined} />
        <Words className="pdf-sub" value={t.sub} fallback="Brand guidelines" onSave={onText ? (v) => onText('sub', v) : undefined} />
        <Words className="pdf-meta" value={t.meta} fallback={year} onSave={onText ? (v) => onText('meta', v) : undefined} />
      </div>
    </div>;
  }
  const ch = guide?.chapters.find((c) => c.id === s.chapter);
  if (!ch) return <div className="pdf-s" />;
  if (s.kind === 'divider') {
    const d = cfg.divider, own = cfg.dividers?.[ch.id] || {};
    return <div className={`pdf-s pdf-div al-${d.align} pl-${d.place}`} style={{ background: d.bg, color: d.ink, ...pad }}>
      <Logo url={logoUrl} place={d.logo} ink={d.ink} />
      <div className="pdf-tt">
        {d.number ? <p className="pdf-num">{String(s.n).padStart(2, '0')}</p> : null}
        <Words tag="h2" className="pdf-h2" value={own.title} fallback={ch.title} onSave={onText ? (v) => onText('title', v) : undefined} />
        {d.intro && (own.intro || ch.lede || onText) ? <Words className="pdf-intro" value={own.intro} fallback={ch.lede || (onText ? 'Add an introduction' : '')} onSave={onText ? (v) => onText('intro', v === 'Add an introduction' ? '' : v) : undefined} /> : null}
      </div>
    </div>;
  }
  const b = ch.blocks.find((x) => x.id === s.block);
  const sc = cfg.section;
  return <div className="pdf-s pdf-sec" style={{ background: sc.bg, color: sc.ink }}>
    {sc.header ? <p className="pdf-head" style={{ left: m.left, top: Math.max(16, m.top / 2 - 12) }}>{ch.title}</p> : null}
    {sc.pageNumbers && s.page ? <p className="pdf-pg" style={{ right: m.right, bottom: Math.max(16, m.bottom / 2 - 12) }}>{s.page} / {total}</p> : null}
    <Logo url={logoUrl} place={sc.logo} ink={sc.ink} />
    <div className="pdf-area" style={{ left: m.left, right: m.right, top: m.top, bottom: m.bottom, alignItems: sc.place === 'centre' ? 'center' : 'flex-start' }}>
      {b ? <Fitted block={b} urls={urls} chapter={ch.title} areaW={SLIDE_W - m.left - m.right} areaH={SLIDE_H - m.top - m.bottom} /> : null}
    </div>
  </div>;
}

/** A section at the portal's width, scaled to fit the slide's content area */
function Fitted({ block, urls, chapter, areaW, areaH }: { block: Block; urls: Record<string, string>; chapter: string; areaW: number; areaH: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState(areaW / PORTAL_W);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => { const h = el.offsetHeight || 1; setZ(Math.min(areaW / PORTAL_W, areaH / h)); };
    const ro = new ResizeObserver(fit); ro.observe(el); fit(); return () => ro.disconnect();
  }, [areaW, areaH]);
  return <div className="pdf-fit" style={{ zoom: z }}><div ref={ref} className="pt-page gsys pdf-content" style={{ width: PORTAL_W }}><GuideBlock b={block} urls={urls} headingLevel={3} chapter={chapter} /></div></div>;
}
