'use client';
import { useEffect, useRef } from 'react';
import type { Guide, Block } from '@/lib/portal/guide';
import type { BlockMedia } from '@/lib/figma/blocks';
import { GuideBlock } from '@/components/portal/GuideBlock';
import { textProps } from '@/lib/textStyle';
import {
  SLIDE_H, SLIDE_W, blockImages, bodyBlock, headerParts, isLightInk, logoFor, mergeBlock, slideSpec, spanBox, visibleBlock,
  type KitLogo, type LogoPlace, type PdfSettings, type Span, type Spec, type StyleId
} from '@/lib/pdf';

// One 1920×1080 slide. Title slides and dividers are set in the deck's own type styles. A section slide is the
// guideline's section itself, drawn by the same renderer and in the same styles as the guidelines (frames, rules,
// fills, corner marks), laid out across the slide: its header (label, headline, introduction) sits above the hang
// line, its body hangs from it. The guide's section is the master; the slide's formatting changes sit over it.

export type SlideInfo = { id: string; label: string; page: number } & ({ kind: 'title' } | { kind: 'divider'; chapter: string; n: number } | { kind: 'section'; chapter: string; block: string; n: number });
export type SlideCtx = { cfg: PdfSettings; guide: Guide; urls: Record<string, string>; logos: KitLogo[]; client: string; total: number };

const cls = (id: StyleId, extra = '') => `pd2-t pd2-t-${id}${extra ? ' ' + extra : ''}`;
const col = ([a, b]: Span) => ({ gridColumn: `${a} / ${b + 1}` });
const overlap = (x: Span, y: Span) => x[0] <= y[1] && y[0] <= x[1];
const pos = (f: [number, number]) => `${f[0]}% ${f[1]}%`;
const Paras = ({ text, className, style, field }: { text?: string; className: string; style?: React.CSSProperties; field?: string }) => !text ? null : <div className={className} style={style} data-pdf-field={field}>{text.split(/\n+/).filter((p) => p.trim()).map((p, i) => <p key={i}>{p}</p>)}</div>;

/** The logo file that suits the slide, shown as it is (light artwork on dark slides) */
function Logo({ logo, place, cfg }: { logo?: KitLogo; place: LogoPlace; cfg: PdfSettings }) {
  if (!logo || place === 'none') return null;
  const m = cfg.margins;
  const st: React.CSSProperties = place === 'centre' ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', height: 120 }
    : { [place.startsWith('top') ? 'top' : 'bottom']: Math.max(24, m[place.startsWith('top') ? 'top' : 'bottom'] / 2 - 24), [place.endsWith('left') ? 'left' : 'right']: m[place.endsWith('left') ? 'left' : 'right'] };
  return <img className="pd2-logo" src={logo.url} alt="" style={{ ...st, objectFit: 'contain', objectPosition: place.endsWith('right') ? 'right center' : place === 'centre' ? 'center' : 'left center' }} data-logo={logo.key} />;
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

/** The background: colour, then a picture, then the colour again over it as much as the slide says */
function Back({ spec, urls }: { spec: Spec; urls: Record<string, string> }) {
  const { look } = spec; const u = look.image ? urls[look.image] : undefined;
  if (!u) return null;
  return <><img className="pd2-bg" src={u} alt="" style={{ objectFit: look.fit, objectPosition: pos(look.focus) }} />{look.dim ? <span className="pd2-dim" style={{ background: look.bg, opacity: look.dim / 100 }} /> : null}</>;
}

/** Headline and text placed on the grid: side by side when their columns don't meet, one under the other when they do */
function TextRow({ head, body, spec, cfg }: { head: React.ReactNode; body: React.ReactNode; spec: Spec; cfg: PdfSettings }) {
  const stacked = !head || !body || overlap(spec.head, spec.body);
  return <div className="pd2-row" style={{ gridTemplateColumns: `repeat(${cfg.grid.cols}, minmax(0, 1fr))`, columnGap: cfg.grid.gutter }}>
    {head ? <div className="pd2-head" style={{ ...col(spec.head), gridRow: 1 }}>{head}</div> : null}
    {body ? <div className="pd2-body" style={{ ...col(spec.body), gridRow: stacked && head ? 2 : 1 }}>{body}</div> : null}
  </div>;
}

/** Part of a section drawn at the guide's web scale and zoomed up to the slide, so every frame, gap and stroke keeps
 *  its proportions while it stretches across the columns it's given */
function Zoomed({ width, height, scale, children, className = '' }: { width: number; height?: number; scale: number; children: React.ReactNode; className?: string }) {
  return <div className={'pd3-g ' + className} style={{ width: width / scale, ...(height !== undefined ? { height: height / scale } : {}), zoom: scale }}>{children}</div>;
}

/** The section's header: its label, headline and (for frames and cards) introduction, in the guide's classes and styles */
function Header({ b }: { b: Block }) {
  const h = headerParts(b);
  const tone = [b.headSize ? `hs-${b.headSize}` : '', b.bodySize ? `bs-${b.bodySize}` : '', b.align === 'center' ? 'al-c' : ''].filter(Boolean).join(' ');
  const t = (f: 'eyebrow' | 'heading' | 'body') => textProps(b.styles?.[f]);
  const eb = t('eyebrow'), hd = t('heading'), bd = t('body');
  const gap = b.gapBefore?.body;
  return <section className={'gb pd3-hd ' + tone}>
    {h.eyebrow || h.heading ? <div className="gb-head">
      {h.eyebrow ? <p className={'gb-eb ' + eb.className} style={eb.style} data-pdf-field="eyebrow">{b.eyebrow}</p> : null}
      {h.heading ? <h3 className={'gb-h' + (b.kind === 'cover' || b.headSize === 'XL' ? ' xl' : '') + ' ' + hd.className} style={hd.style} data-pdf-field="heading">{b.heading}</h3> : null}
    </div> : null}
    {h.body ? <Paras field="body" text={b.body} className={'gb-body gb-intro ' + bd.className} style={{ ...bd.style, ...(h.eyebrow || h.heading ? { marginTop: gap !== undefined ? `calc(${gap}px - 20px)` : 'calc(var(--sp-head-body, 20px) - 20px)' } : {}) }} /> : null}
  </section>;
}

/** A picture that fills its box from a focal point */
function Fill({ m, url, fit, focus, style, className = 'pd3-bleed' }: { m: BlockMedia; url?: string; fit?: 'cover' | 'contain'; focus: [number, number]; style: React.CSSProperties; className?: string }) {
  return <div className={className} style={style} data-bleed="">{url ? <img src={url} alt={m.caption || ''} style={{ objectFit: fit || (m.kind === 'graphic' ? 'contain' : 'cover'), objectPosition: pos(focus) }} /> : null}</div>;
}

export function Slide({ s, ctx, onWords }: { s: SlideInfo; ctx: SlideCtx; onWords?: (key: string, v: string) => void }) {
  const { cfg, guide, urls, logos, client, total } = ctx;
  const ch = s.kind !== 'title' ? guide.chapters.find((c) => c.id === s.chapter) : undefined;
  const master: Block | undefined = s.kind === 'section' ? ch?.blocks.find((x) => x.id === s.block) : undefined;
  const ov = cfg.slides[s.id] || {};
  const b = master ? visibleBlock(mergeBlock(master, ov.block)) : undefined;
  const spec = slideSpec(cfg, s.id, s.kind, b);
  const { look } = spec;
  const m = cfg.margins;
  // A logo that sits on a bleeding picture takes the version for dark backgrounds
  const onPic = spec.bleed && !!b && (b.kind !== 'split' || look.logo === 'centre' || look.logo.endsWith('right') === (b.side !== 'left'));
  const logo = logoFor(logos, cfg, onPic ? '#ffffff' : look.ink, ov.logoFile);
  const furniture = (headL: number, coversR: boolean) => <>
    {look.header && s.kind !== 'title' && ch ? <p className={cls('label', 'pd2-header')} style={{ left: headL, top: m.top / 2 }}><span>{String(s.n).padStart(2, '0')}</span><span>{ch.title}</span></p> : null}
    {look.pageNumber && s.page ? <p className={cls('label', 'pd2-pg')} style={{ bottom: m.bottom / 2, ...(coversR ? { left: headL } : { right: m.right }) }}>{String(s.page).padStart(2, '0')}<span className="pd2-of"> / {String(total).padStart(2, '0')}</span></p> : null}
    <Logo logo={logo} place={look.logo} cfg={cfg} />
  </>;
  const shell = (kind: string, children: React.ReactNode, extra?: React.ReactNode, headL = m.left, coversR = false) =>
    <div className={`pd2-s pd2-${kind} al-${look.align}${isLightInk(look.ink) ? ' on-dark' : ''}`} style={{ background: look.bg, color: look.ink }} data-slide={s.id}>
      <Back spec={spec} urls={urls} />{extra}
      {children}
      {furniture(headL, coversR)}
    </div>;
  // Title slides and dividers: the words sit between the margins, from the top margin, the hang line, the middle or the bottom margin
  const area: React.CSSProperties = { left: m.left, right: m.right, top: look.valign === 'hang' ? spec.hangY : m.top, bottom: m.bottom,
    justifyContent: look.valign === 'centre' ? 'center' : look.valign === 'bottom' ? 'flex-end' : 'flex-start', textAlign: look.align === 'centre' ? 'center' : 'left' };

  if (s.kind === 'title') {
    const t = cfg.title, year = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return shell('title', <div className="pd2-area" style={area}><TextRow spec={spec} cfg={cfg}
      head={<Words tag="h1" id="title" label="Title" value={t.heading} fallback={client} onSave={onWords ? (v) => onWords('heading', v) : undefined} />}
      body={<><Words id="subhead" label="Subtitle" value={t.sub} fallback="Brand guidelines" onSave={onWords ? (v) => onWords('sub', v) : undefined} />
        <Words id="caption" label="Date" value={t.meta} fallback={year} onSave={onWords ? (v) => onWords('meta', v) : undefined} /></>} /></div>);
  }
  if (!ch) return <div className="pd2-s" />;
  if (s.kind === 'divider') {
    const d = cfg.divider, own = cfg.dividers?.[ch.id] || {};
    const intro = own.intro || ch.lede;
    return shell('divider', <div className="pd2-area" style={area}><TextRow spec={spec} cfg={cfg}
      head={<>{d.number ? <p className={cls('label', 'pd2-num')}>{String(s.n).padStart(2, '0')}</p> : null}
        <Words tag="h2" id="divider" label="Chapter name" value={own.title} fallback={ch.title} onSave={onWords ? (v) => onWords('title', v) : undefined} /></>}
      body={d.intro && (intro || onWords) ? <Words id="subhead" label="Introduction" value={own.intro} fallback={ch.lede || (onWords ? 'Add an introduction' : '')} onSave={onWords ? (v) => onWords('intro', v === 'Add an introduction' ? '' : v) : undefined} /> : null} /></div>);
  }
  if (!b) return <div className="pd2-s" />;

  // A section: the header above the hang line, the body from it, both on the grid and in the guide's own styles
  const k = cfg.scale, n = cfg.grid.cols;
  const imgs = blockImages(b);
  const feature = spec.bleed ? imgs[Math.min(spec.pick, Math.max(0, imgs.length - 1))] : undefined;
  let headSpan = spec.head, bodySpan = spec.body, pic: React.ReactNode = null, headL = m.left, coversR = false;
  let body: Block = bodyBlock(b);
  if (feature && b.kind === 'split') {
    // Text and image with the picture running off the slide's edge: the text keeps half the grid, the picture the rest
    const half = Math.max(1, Math.floor(n / 2)); const left = b.side === 'left';
    const textSpan: Span = left ? [half + 1, n] : [1, half];
    headSpan = [Math.max(textSpan[0], Math.min(headSpan[0], textSpan[1])), Math.min(textSpan[1], Math.max(headSpan[1], textSpan[0]))]; bodySpan = textSpan;
    const edge = spanBox(cfg, [half + 1, half + 1]).left - cfg.grid.gutter / 2;
    pic = <Fill m={feature} url={urls[feature.path]} fit={spec.mediaFit} focus={spec.mediaFocus} style={left ? { left: 0, width: edge - cfg.grid.gutter / 2, top: 0, height: SLIDE_H } : { left: edge + cfg.grid.gutter / 2, right: 0, top: 0, height: SLIDE_H }} />;
    body = { ...body, kind: 'text', media: [] };
    if (left) headL = spanBox(cfg, textSpan).left; else coversR = true;
  } else if (feature) {
    // One picture filling the slide, the words over it
    pic = <><Fill m={feature} url={urls[feature.path]} fit={spec.mediaFit} focus={spec.mediaFocus} style={{ inset: 0 }} />{isLightInk(look.ink) ? <span className="pd2-scrim" /> : null}</>;
    body = { ...body, media: [] };
  }
  const hb = spanBox(cfg, headSpan), bb = spanBox(cfg, bodySpan);
  const hasHead = Object.values(headerParts(b)).some(Boolean);
  const bodyH = SLIDE_H - spec.hangY - m.bottom;
  const hasBody = !!(body.body || body.heading || body.eyebrow || body.items?.length || body.swatches?.length || (body.media || []).some((x) => x.path) || body.extras?.length);
  const fill = ['image', 'split', 'media'].includes(body.kind) && (body.media || []).some((x) => x.path);
  const statement = b.kind === 'statement';
  // A statement on a colour or picture is on the slide's own background, so it isn't put in a panel again
  if (statement) body = { ...body, bg: undefined, backdrop: undefined, full: undefined, ratio: undefined };
  return shell(`sec k-${b.kind}${spec.bleed ? ' bleeds' : ''}`, <>
    {hasHead ? <div className="pd3-head" data-zone="head" style={{ left: hb.left, width: hb.width, bottom: SLIDE_H - spec.hangY + cfg.headerGap, textAlign: look.align === 'centre' ? 'center' : undefined }}>
      <Zoomed width={hb.width} scale={k}><Header b={b} /></Zoomed>
    </div> : null}
    {hasBody ? <div className={'pd3-body' + (fill ? ' fill' : '')} data-zone="body" data-block={b.id} style={{ left: bb.left, width: bb.width, top: spec.hangY, height: bodyH }}>
      <Zoomed width={bb.width} height={bodyH} scale={k}><GuideBlock b={body} urls={urls} headingLevel={3} /></Zoomed>
    </div> : null}
  </>, pic, headL, coversR);
}

/** A slide shown at a given width, with the grid, margins and hang line over it when editing */
export function SlideBox({ width, children, guides, label, overlay }: { width: number; children: React.ReactNode; label?: string; overlay?: React.ReactNode;
  guides?: { cfg: PdfSettings; hangY: number; grid: boolean; hang: boolean; headerGap?: number } }) {
  const z = width / SLIDE_W;
  const g = guides;
  return <div className="pd2-box" style={{ width, height: width * SLIDE_H / SLIDE_W }} role={label ? 'img' : undefined} aria-label={label}>
    <div className="pd2-zoom" style={{ width: SLIDE_W, height: SLIDE_H, zoom: z }}>{children}</div>
    {g?.grid ? <div className="pd2-ov" aria-hidden>
      <span className="pd2-ov-m" style={{ left: g.cfg.margins.left * z, right: g.cfg.margins.right * z, top: g.cfg.margins.top * z, bottom: g.cfg.margins.bottom * z }} />
      {Array.from({ length: g.cfg.grid.cols }, (_, i) => { const bx = spanBox(g.cfg, [i + 1, i + 1]); return <span key={i} className="pd2-ov-c" style={{ left: bx.left * z, width: bx.width * z, top: g.cfg.margins.top * z, bottom: g.cfg.margins.bottom * z }} />; })}
    </div> : null}
    {g?.hang ? <div className="pd2-ov" aria-hidden>
      {g.headerGap ? <span className="pd2-ov-hg" style={{ top: (g.hangY - g.headerGap) * z, height: g.headerGap * z }} /> : null}
      <span className="pd2-ov-h" style={{ top: g.hangY * z }}><i>Hang {g.hangY}</i></span>
    </div> : null}
    {overlay}
  </div>;
}
