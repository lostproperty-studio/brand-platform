'use client';
import { useEffect, useRef } from 'react';
import type { Guide, Block } from '@/lib/portal/guide';
import { cleanSvg, fillMedia, itemEls, type BlockItem, type BlockMedia } from '@/lib/figma/blocks';
import { SLIDE_H, SLIDE_W, blockImages, inkOn, slideSpec, spanBox, type LogoPlace, type PdfSettings, type Span, type Spec, type StyleId } from '@/lib/pdf';

// One 1920×1080 slide, drawn from its parts on the deck's grid: words in the deck's type styles hanging from the hang
// line, pictures on grid columns or bleeding off the edge. Content comes from the guide and can't be changed here
// (only the title slide's and dividers' own words, which aren't in the guide).

export type SlideInfo = { id: string; label: string; page: number } & ({ kind: 'title' } | { kind: 'divider'; chapter: string; n: number } | { kind: 'section'; chapter: string; block: string; n: number });
export type SlideCtx = { cfg: PdfSettings; guide: Guide; urls: Record<string, string>; logoUrl: string | null; client: string; total: number };

const cls = (id: StyleId, extra = '') => `pd2-t pd2-t-${id}${extra ? ' ' + extra : ''}`;
const Paras = ({ text, id }: { text?: string; id: StyleId }) => !text ? null : <div className={cls(id, 'pd2-paras')}>{text.split(/\n+/).filter((p) => p.trim()).map((p, i) => <p key={i}>{p}</p>)}</div>;
const col = ([a, b]: Span) => ({ gridColumn: `${a} / ${b + 1}` });
const overlap = (x: Span, y: Span) => x[0] <= y[1] && y[0] <= x[1];
const pos = (f: [number, number]) => `${f[0]}% ${f[1]}%`;

/** The logo, in the slide's text colour so it reads on any background */
function Logo({ url, place, ink, cfg }: { url: string | null; place: LogoPlace; ink: string; cfg: PdfSettings }) {
  if (!url || place === 'none') return null;
  const m = cfg.margins, white = inkOn(ink) === '#111111';
  const st: React.CSSProperties = place === 'centre' ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', height: 120 }
    : { [place.startsWith('top') ? 'top' : 'bottom']: Math.max(24, m[place.startsWith('top') ? 'top' : 'bottom'] / 2 - 24), [place.endsWith('left') ? 'left' : 'right']: m[place.endsWith('left') ? 'left' : 'right'] };
  return <img className="pd2-logo" src={url} alt="" style={{ ...st, filter: white ? 'brightness(0) invert(1)' : 'brightness(0)' }} />;
}

/** Words you can change on the slide itself (title slide and dividers only) */
function Words({ value, fallback, onSave, id, tag: Tag = 'p', label }: { value?: string; fallback: string; onSave?: (v: string) => void; id: StyleId; tag?: 'p' | 'h1' | 'h2'; label: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (ref.current && document.activeElement !== ref.current) ref.current.innerText = value || fallback; }, [value, fallback]);
  if (!onSave) return (value || fallback) ? <Tag className={cls(id)}>{value || fallback}</Tag> : null;
  return <Tag ref={ref as never} className={cls(id, 'pd2-ed')} contentEditable suppressContentEditableWarning spellCheck={false} role="textbox" aria-label={label}
    onBlur={(e) => { const v = (e.currentTarget as HTMLElement).innerText.trim(); if (v !== (value || fallback)) onSave(v === fallback ? '' : v); }}
    onKeyDown={(e) => { if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); } }} />;
}

/** A picture, filling its box or fitting inside it, from a focal point */
function Pic({ m, url, fit, focus }: { m: BlockMedia; url?: string; fit?: 'cover' | 'contain'; focus?: [number, number] }) {
  if (!url) return <span className="pd2-pic pd2-missing" aria-hidden />;
  const f = fit || (m.kind === 'graphic' ? 'contain' : 'cover');
  return <span className={'pd2-pic' + (f === 'contain' ? ' fit' : '') + (m.kind === 'graphic' ? ' graphic' : '')}><img src={url} alt={m.caption || ''} style={{ objectFit: f, objectPosition: pos(focus || [50, 50]) }} /></span>;
}

/** A frame in a grid: its picture, then its label, headline and text */
function Frame({ it, urls, fit }: { it: BlockItem; urls: Record<string, string>; fit?: 'cover' | 'contain' }) {
  const els = itemEls(it).filter((e) => !e.hidden);
  const img = els.find((e) => e.kind === 'image' && e.media)?.media || fillMedia(it.look);
  const icon = els.find((e) => e.kind === 'icon' && e.icon?.svg);
  const fill = it.look?.fill?.type === 'colour' ? it.look.fill.colour : undefined;
  const words = els.filter((e) => (e.kind === 'label' || e.kind === 'heading' || e.kind === 'text') && e.text);
  return <div className={'pd2-frame' + (img ? ' has-pic' : '') + (fill ? ' filled' : '')} style={fill ? { background: fill, color: inkOn(fill) } : undefined}>
    {img ? <Pic m={img} url={urls[img.path]} fit={fit} /> : null}
    {icon ? <span className="pd2-icon" aria-hidden dangerouslySetInnerHTML={{ __html: cleanSvg(icon.icon!.svg) }} /> : null}
    {words.length ? <div className="pd2-fw">{words.map((e) => e.kind === 'label' ? <p key={e.id} className={cls('label')}>{e.text}</p> : e.kind === 'heading' ? <p key={e.id} className={cls('subhead')}>{e.text}</p> : <Paras key={e.id} text={e.text} id="small" />)}</div> : null}
  </div>;
}

/** The background: colour, then a picture, then the colour again over it as much as the slide says */
function Back({ spec, urls }: { spec: Spec; urls: Record<string, string> }) {
  const { look } = spec; const u = look.image ? urls[look.image] : undefined;
  if (!u) return null;
  return <><img className="pd2-bg" src={u} alt="" style={{ objectFit: look.fit, objectPosition: pos(look.focus) }} />{look.dim ? <span className="pd2-dim" style={{ background: look.bg, opacity: look.dim / 100 }} /> : null}</>;
}

/** Headline and text placed on the grid: side by side when their columns don't meet, one under the other when they do */
function TextRow({ head, body, spec, cfg }: { head: React.ReactNode; body: React.ReactNode; spec: Spec; cfg: PdfSettings }) {
  const { zones } = spec;
  const stacked = !head || !body || overlap(zones.head, zones.body);
  return <div className="pd2-row" style={{ gridTemplateColumns: `repeat(${cfg.grid.cols}, minmax(0, 1fr))`, columnGap: cfg.grid.gutter }}>
    {head ? <div className="pd2-head" style={{ ...col(zones.head), gridRow: 1 }}>{head}</div> : null}
    {body ? <div className="pd2-body" style={{ ...col(zones.body), gridRow: stacked && head ? 2 : 1 }}>{body}</div> : null}
  </div>;
}

export function Slide({ s, ctx, onWords }: { s: SlideInfo; ctx: SlideCtx; onWords?: (key: string, v: string) => void }) {
  const { cfg, guide, urls, logoUrl, client, total } = ctx;
  const ch = s.kind !== 'title' ? guide.chapters.find((c) => c.id === s.chapter) : undefined;
  const b: Block | undefined = s.kind === 'section' ? ch?.blocks.find((x) => x.id === s.block) : undefined;
  const spec = slideSpec(cfg, s.id, s.kind, b);
  const { look, layout, zones } = spec;
  const m = cfg.margins;
  // The words sit between the margins, from the top margin, the hang line, the middle or the bottom margin
  const area: React.CSSProperties = { left: m.left, right: m.right, top: look.valign === 'hang' ? spec.hangY : m.top, bottom: m.bottom,
    justifyContent: look.valign === 'centre' ? 'center' : look.valign === 'bottom' ? 'flex-end' : 'flex-start', textAlign: look.align === 'centre' ? 'center' : 'left' };
  // Running header and page number stay clear of a picture that bleeds off the edge they'd sit on
  const bleedy = s.kind === 'section' && zones.bleed && (layout === 'text-image' || layout === 'image-text');
  const coversL = bleedy && zones.media[0] === 1, coversR = bleedy && zones.media[1] === cfg.grid.cols;
  const headL = coversL ? spanBox(cfg, zones.head).left : m.left;
  const furniture = <>
    {look.header && s.kind !== 'title' && ch ? <p className={cls('label', 'pd2-header')} style={{ left: headL, top: m.top / 2 }}><span>{String(s.n).padStart(2, '0')}</span><span>{ch.title}</span></p> : null}
    {look.pageNumber && s.page ? <p className={cls('label', 'pd2-pg')} style={{ bottom: m.bottom / 2, ...(coversR ? { left: coversL ? headL : m.left } : { right: m.right }) }}>{String(s.page).padStart(2, '0')}<span className="pd2-of"> / {String(total).padStart(2, '0')}</span></p> : null}
    <Logo url={logoUrl} place={look.logo} ink={look.ink} cfg={cfg} />
  </>;
  const shell = (kind: string, children: React.ReactNode, extra?: React.ReactNode) =>
    <div className={`pd2-s pd2-${kind} al-${look.align}`} style={{ background: look.bg, color: look.ink }} data-slide={s.id}>
      <Back spec={spec} urls={urls} />{extra}
      <div className="pd2-area" style={area}>{children}</div>
      {furniture}
    </div>;

  if (s.kind === 'title') {
    const t = cfg.title, year = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return shell('title', <TextRow spec={spec} cfg={cfg}
      head={<Words tag="h1" id="title" label="Title" value={t.heading} fallback={client} onSave={onWords ? (v) => onWords('heading', v) : undefined} />}
      body={<><Words id="subhead" label="Subtitle" value={t.sub} fallback="Brand guidelines" onSave={onWords ? (v) => onWords('sub', v) : undefined} />
        <Words id="caption" label="Date" value={t.meta} fallback={year} onSave={onWords ? (v) => onWords('meta', v) : undefined} /></>} />);
  }
  if (!ch) return <div className="pd2-s" />;
  if (s.kind === 'divider') {
    const d = cfg.divider, own = cfg.dividers?.[ch.id] || {};
    const intro = own.intro || ch.lede;
    return shell('divider', <TextRow spec={spec} cfg={cfg}
      head={<>{d.number ? <p className={cls('label', 'pd2-num')}>{String(s.n).padStart(2, '0')}</p> : null}
        <Words tag="h2" id="divider" label="Chapter name" value={own.title} fallback={ch.title} onSave={onWords ? (v) => onWords('title', v) : undefined} /></>}
      body={d.intro && (intro || onWords) ? <Words id="subhead" label="Introduction" value={own.intro} fallback={ch.lede || (onWords ? 'Add an introduction' : '')} onSave={onWords ? (v) => onWords('intro', v === 'Add an introduction' ? '' : v) : undefined} /> : null} />);
  }
  if (!b) return <div className="pd2-s" />;

  // A section, from its parts
  const imgs = blockImages(b);
  const feature = imgs[Math.min(spec.pick, Math.max(0, imgs.length - 1))];
  const extras = (b.extras || []).filter((x) => x.text && x.kind !== 'button');
  const headId: StyleId = layout === 'statement' ? 'statement' : 'headline';
  const head = b.eyebrow || b.heading ? <>{b.eyebrow ? <p className={cls('label', 'pd2-eb')}>{b.eyebrow}</p> : null}{b.heading ? <h3 className={cls(headId)}>{b.heading}</h3> : null}</> : null;
  const bodyText = <>{b.body ? <Paras text={b.body} id={layout === 'statement' ? 'subhead' : 'body'} /> : null}
    {extras.map((x) => x.kind === 'label' ? <p key={x.id} className={cls('label', 'pd2-x')}>{x.text}</p> : x.kind === 'heading' ? <p key={x.id} className={cls('subhead', 'pd2-x')}>{x.text}</p> : <div key={x.id} className="pd2-x"><Paras text={x.text} id="body" /></div>)}</>;
  const body = b.body || extras.length ? bodyText : null;
  const row = <TextRow head={head} body={body} spec={spec} cfg={cfg} />;

  if (layout === 'image' || layout === 'text-image' || layout === 'image-text') {
    const full = layout === 'image';
    // The picture's box: its columns, out to the slide's edges where it bleeds
    const bx = spanBox(cfg, zones.media);
    const n = cfg.grid.cols;
    const L = zones.media[0] === 1 ? 0 : bx.left, R = zones.media[1] === n ? SLIDE_W : bx.left + bx.width;
    const box: React.CSSProperties = full && zones.bleed ? { left: 0, top: 0, width: SLIDE_W, height: SLIDE_H }
      : zones.bleed ? { left: L, top: 0, height: SLIDE_H, width: R - L }
      : { left: bx.left, width: bx.width, top: look.valign === 'top' || full ? m.top : spec.hangY, bottom: m.bottom };
    const pic = feature ? <div className={'pd2-media' + (full ? ' full' : '')} style={box}><Pic m={feature} url={urls[feature.path]} fit={spec.mediaFit} focus={spec.mediaFocus} />
      {full && inkOn(look.ink) === '#111111' ? <span className="pd2-scrim" /> : null}</div> : null;
    return shell(`sec l-${layout}`, <>{row}{full && feature?.caption && !b.heading ? <p className={cls('caption')}>{feature.caption}</p> : null}</>, pic);
  }
  if (layout === 'grid' || layout === 'swatches') {
    const items = (b.items || []).filter((i) => !i.hidden);
    const frames = layout === 'swatches'
      ? (b.swatches || []).map((sw, i) => <div key={i} className="pd2-chip" style={{ background: sw.hex, color: inkOn(sw.hex) }}><p className={cls('subhead')}>{sw.name}</p><p className={cls('caption')}>{sw.hex.toUpperCase()}{sw.note ? <><br />{sw.note}</> : null}</p></div>)
      : items.length ? items.map((it) => <Frame key={it.id} it={it} urls={urls} fit={spec.mediaFit} />)
        : (b.media || []).map((md, i) => <div key={i} className="pd2-frame has-pic"><Pic m={md} url={urls[md.path]} fit={spec.mediaFit} focus={spec.mediaFocus} />{md.caption ? <div className="pd2-fw"><p className={cls('caption')}>{md.caption}</p></div> : null}</div>);
    const pics = layout === 'swatches' || items.some((it) => itemEls(it).some((e) => e.kind === 'image' && e.media) || fillMedia(it.look)) || (!items.length && (b.media || []).length);
    const rows = Math.ceil(frames.length / zones.up) || 1;
    const fb = spanBox(cfg, zones.media);
    return shell(`sec l-${layout}`, <>{row}<div className={'pd2-frames' + (pics ? ' pics' : ' words')} style={{ gridTemplateColumns: `repeat(${zones.up}, minmax(0, 1fr))`, gridTemplateRows: pics ? `repeat(${rows}, minmax(0, 1fr))` : undefined, gap: cfg.grid.gutter, marginLeft: fb.left - m.left, width: fb.width, marginTop: head || body ? undefined : 0 }}>{frames}</div></>);
  }
  // Text and statements
  return shell(`sec l-${layout}`, row);
}

/** A slide shown at a given width, with the grid, margins and hang line over it when editing */
export function SlideBox({ width, children, guides, label }: { width: number; children: React.ReactNode; label?: string;
  guides?: { cfg: PdfSettings; hangY: number; grid: boolean; hang: boolean } }) {
  const z = width / SLIDE_W;
  const g = guides;
  return <div className="pd2-box" style={{ width, height: width * SLIDE_H / SLIDE_W }} role={label ? 'img' : undefined} aria-label={label}>
    <div className="pd2-zoom" style={{ width: SLIDE_W, height: SLIDE_H, zoom: z }}>{children}</div>
    {g?.grid ? <div className="pd2-ov" aria-hidden>
      <span className="pd2-ov-m" style={{ left: g.cfg.margins.left * z, right: g.cfg.margins.right * z, top: g.cfg.margins.top * z, bottom: g.cfg.margins.bottom * z }} />
      {Array.from({ length: g.cfg.grid.cols }, (_, i) => { const bx = spanBox(g.cfg, [i + 1, i + 1]); return <span key={i} className="pd2-ov-c" style={{ left: bx.left * z, width: bx.width * z, top: g.cfg.margins.top * z, bottom: g.cfg.margins.bottom * z }} />; })}
    </div> : null}
    {g?.hang ? <div className="pd2-ov" aria-hidden><span className="pd2-ov-h" style={{ top: g.hangY * z }}><i>Hang {g.hangY}</i></span></div> : null}
  </div>;
}
