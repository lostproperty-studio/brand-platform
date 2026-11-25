// The guidelines as a PDF: 16:9 slides built from the guide, with a title slide, a divider for each chapter and a page
// for each section. Each section is drawn by the guideline's own section renderer, in the guideline's own styles
// (frames, rules, fills, corners), laid out across the slide's content width. The words and pictures always come from
// the guide (the master); the studio designs the deck here: a grid, a hang line the section's body hangs from (its
// header sits above it), type styles at slide sizes, colours, backgrounds, logos, and formatting changes to any
// section, frame, text or image. Those changes are kept in the PDF's own settings and never touch the guide.
import { itemEls, type Block, type BlockItem, type BlockMedia, type FrameLook, type TextStyle } from '@/lib/figma/blocks';
import type { GuideSystem, SpaceRule, TypeId } from '@/lib/guideSystem';

export const SLIDE_W = 1920, SLIDE_H = 1080;
export type LogoPlace = 'none' | 'top-left' | 'top-right' | 'centre' | 'bottom-left' | 'bottom-right';
export type Align = 'left' | 'centre';
/** Where the words sit down a title slide or divider: at the top margin, from the hang line, centred, or on the bottom margin */
export type VAlign = 'top' | 'hang' | 'centre' | 'bottom';
export type Fit = 'cover' | 'contain';
/** The per-slide layouts of the previous version, read from older saves and mapped onto the guideline's own layouts */
type OldLayout = 'text' | 'text-image' | 'image-text' | 'image' | 'statement' | 'grid' | 'swatches';

/** The deck's type styles. Every word on every slide is set in one of them. */
export type StyleId = 'title' | 'divider' | 'statement' | 'headline' | 'frame' | 'subhead' | 'body' | 'small' | 'caption' | 'label';
export type PdfCase = 'none' | 'upper' | 'lower' | 'sentence' | 'title' | 'smallcaps';
/** font is a typeface role on the project; size in px of a 1920×1080 slide; leading a line-height multiple; tracking in em */
export type PdfStyle = { name: string; font: string; size: number; weight: number; leading: number; tracking: number; case: PdfCase };
export const STYLE_IDS: StyleId[] = ['title', 'divider', 'statement', 'headline', 'frame', 'subhead', 'body', 'small', 'caption', 'label'];
export const STYLE_USE: Record<StyleId, string> = {
  title: 'The client’s name on the title slide', divider: 'Chapter names on dividers', statement: 'Statements and big headlines (the guide’s H1)',
  headline: 'Section headlines (H2)', frame: 'Headlines in frames and cards (H3, H4)', subhead: 'Introductions and subheaders (H5)', body: 'Paragraphs (Body)',
  small: 'Text in frames and cards (Body)', caption: 'Small labels, captions, the date (Caption)', label: 'Labels in frames, header and page numbers (H6)'
};
// Each style starts from one of the guide's own styles (typeface, weight, leading, tracking, case), at a size made for a slide
const BASE: Record<StyleId, { from: TypeId; name: string; size: number }> = {
  title: { from: 'h1', name: 'Title', size: 168 }, divider: { from: 'h1', name: 'Divider', size: 144 }, statement: { from: 'h1', name: 'Statement', size: 104 },
  headline: { from: 'h2', name: 'Headline', size: 72 }, frame: { from: 'h4', name: 'Frame headline', size: 40 }, subhead: { from: 'h5', name: 'Subhead', size: 34 },
  body: { from: 'body', name: 'Body', size: 24 }, small: { from: 'body', name: 'Frame text', size: 24 }, caption: { from: 'caption', name: 'Caption', size: 18 }, label: { from: 'h6', name: 'Label', size: 22 }
};

/** A run of grid columns: the first and the last, counting from 1 */
export type Span = [number, number];
/** How a slide looks. Each kind of slide (title, dividers, content) has a full set; a slide can override any of it. */
export type Look = {
  bg: string; ink: string; align: Align; valign: VAlign; logo: LogoPlace; header: boolean; pageNumber: boolean;
  /** A background picture (a stored path); '' means none */ image?: string; fit: Fit; /** Focal point, % across and down */ focus: [number, number];
  /** How much of the background colour lies over the picture, 0–90 % */ dim: number;
};

// ---------- Formatting changes to a section, kept in the PDF only
/** A change to an element inside a frame (a frame in a frame, an icon, a button, a spacer) */
export type ElOv = { look?: FrameLook; size?: number | null; colour?: string | null; variant?: 'primary' | 'link' | null; hidden?: boolean };
/** A change to a frame (an item in an auto layout, grid or carousel). null clears what the guide sets. */
export type ItemOv = { w?: number | null; h?: number | null; align?: BlockItem['align'] | null; gap?: number | null; pad?: number | null; box?: BlockItem['box'] | null;
  look?: FrameLook; hidden?: boolean; /** Fixed fields (label, heading, body, media) left out of the PDF */ hide?: string[]; els?: Record<string, ElOv> };
/** A change to one of the section's pictures, by its stored path */
export type MediaOv = { look?: FrameLook; hidden?: boolean };
/** The section-level settings a PDF can change: layout and formatting, never words or pictures */
export const SECTION_KEYS = ['kind', 'layout', 'cols', 'side', 'textAlign', 'box', 'flow', 'gridCols', 'rowH', 'gap', 'gapX', 'gapY', 'pad', 'boxAlign', 'boxGap', 'boxBg', 'order', 'variant', 'ratio', 'full', 'headSize', 'bodySize', 'bodyCols', 'align', 'bg', 'ink', 'gapBefore'] as const;
type SectionKey = typeof SECTION_KEYS[number];
/** A slide's changes to its section, merged over the guide's section when it's drawn */
export type BlockOv = { [K in SectionKey]?: Block[K] | null } & {
  /** Text styles, by text key ('heading', '<itemId>.<field>'), each replacing the guide's for that text */ styles?: Record<string, TextStyle>;
  items?: Record<string, ItemOv>; /** Frame order, by id */ itemOrder?: string[];
  media?: Record<string, MediaOv>; /** Section texts left out of the PDF ('eyebrow', 'heading', 'body', 'x-<id>') */ hide?: string[];
};
const ITEM_KEYS = ['w', 'h', 'align', 'gap', 'pad', 'box'] as const;
const EL_KEYS = ['size', 'colour', 'variant'] as const;

/** One slide's own settings, over its kind's */
export type SlideOverrides = Partial<Look> & {
  /** Grid columns for the section's header (above the hang line) and its body (from the hang line) */ head?: Span; body?: Span;
  /** The section's picture fills the slide (one image) or its half of it (text and image), running off the edges */ bleed?: boolean;
  /** Which of the section's pictures fills the slide when it bleeds, and its focal point */ pick?: number; mediaFit?: Fit; mediaFocus?: [number, number];
  /** The section's formatting in the PDF, over the guide's */ block?: BlockOv;
  /** A logo file for this slide (a kit path) instead of the document's */ logoFile?: string;
  /** Older saves */ layout?: OldLayout; media?: Span; up?: number;
};
export type PdfSettings = {
  /** Space around the content on every slide, in pixels of a 1920×1080 slide */
  margins: { top: number; right: number; bottom: number; left: number };
  /** Columns between the margins and the gutter between them */
  grid: { cols: number; gutter: number };
  /** The lines section bodies and dividers hang from, in pixels down the slide */
  hang: { content: number; divider: number };
  /** The space between a section's header (label, headline, introduction) and the hang line under it */
  headerGap: number;
  /** How much larger the guideline's frames, spacing and strokes are on a slide than on the web page */
  scale: number;
  /** Changes to the type styles (what's not set follows the guide) */
  styles: Partial<Record<StyleId, Partial<PdfStyle>>>;
  /** The guide's spacing rules, changed for the PDF only */
  space: Partial<Record<SpaceRule, number>>;
  /** The logo files to use (kit paths): on light backgrounds and on dark ones. Unset is automatic. */
  logo: { main?: string; light?: string };
  title: Look & { heading?: string; sub?: string; meta?: string };
  divider: Look & { number: boolean; intro: boolean };
  section: Look;
  /** Each slide's own settings, by slide id ('title', 'd:<chapter>', 's:<block>') */
  slides: Record<string, SlideOverrides>;
  /** Changed words for a chapter's divider */
  dividers?: Record<string, { title?: string; intro?: string }>;
  /** Chapters and sections left out of the PDF */
  skip?: string[];
};

const HEX6 = /^#[0-9a-f]{6}$/i;
const lum = (h: string) => { const n = parseInt(h.slice(1, 7), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
/** Black or white, whichever reads on a colour */
export const inkOn = (h: string) => (HEX6.test(h) && lum(h) > 0.6 ? '#111111' : '#ffffff');
/** Light ink (white text) means a dark slide */
export const isLightInk = (h: string) => HEX6.test(h) && lum(h) > 0.6;
const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const placeTo = (p: unknown): VAlign | undefined => (p === 'top' ? 'top' : p === 'centre' ? 'centre' : p === 'bottom' ? 'bottom' : undefined);

/** An older slide's layout, read as the new settings: a full-bleed or half-bleed picture, frames per row */
function upgradeSlide(s: SlideOverrides): SlideOverrides {
  if (!s || (!s.layout && s.up === undefined && !s.media)) return s;
  const { layout, up, media: _m, ...rest } = s; void _m;
  const out: SlideOverrides = { ...rest };
  if (layout === 'image' || layout === 'text-image' || layout === 'image-text') { if (out.bleed === undefined) out.bleed = true; }
  if (layout === 'text-image' || layout === 'image-text') out.block = { side: layout === 'image-text' ? 'left' : 'right', ...(out.block || {}) };
  if (up !== undefined && (layout === 'grid' || !layout)) out.block = { cols: up, ...(out.block || {}) };
  return out;
}

/** The saved settings, with older saves (templates with a place, margins only, per-slide layouts) mapped onto the new shape */
export function readPdf(content: unknown, colours: { hex: string }[] = []): PdfSettings {
  type Old = { place?: string; pageNumbers?: boolean };
  const saved = ((content as { pdf?: Record<string, unknown> } | null)?.pdf || {}) as Partial<PdfSettings> & { title?: Old; divider?: Old; section?: Old };
  // Defaults from the brand: its first colour for the covers, paper white for the pages
  const brand = colours.find((c) => HEX6.test(c.hex))?.hex || '#111111';
  const look = (d: Look, s: (Partial<Look> & Old) | undefined, oldPlace: (p: unknown) => VAlign | undefined): Look => {
    const { place, pageNumbers, ...rest } = s || {};
    return { ...d, ...rest, valign: rest.valign || oldPlace(place) || d.valign, pageNumber: rest.pageNumber ?? pageNumbers ?? d.pageNumber,
      focus: Array.isArray(rest.focus) ? rest.focus : d.focus, dim: num(rest.dim, d.dim, 0, 90) };
  };
  const cover: Look = { bg: brand, ink: inkOn(brand), align: 'left', valign: 'bottom', logo: 'top-left', header: false, pageNumber: false, fit: 'cover', focus: [50, 50], dim: 0 };
  const t = saved.title as (PdfSettings['title'] & Old) | undefined, d = saved.divider as (PdfSettings['divider'] & Old) | undefined;
  const m = saved.margins || ({} as Partial<PdfSettings['margins']>);
  const slides = Object.fromEntries(Object.entries(saved.slides || {}).map(([k, v]) => [k, upgradeSlide(v)]));
  return {
    margins: { top: num(m.top, 96, 0, 400), right: num(m.right, 120, 0, 600), bottom: num(m.bottom, 96, 0, 400), left: num(m.left, 120, 0, 600) },
    grid: { cols: num(saved.grid?.cols, 12, 1, 24), gutter: num(saved.grid?.gutter, 32, 0, 200) },
    hang: { content: num(saved.hang?.content, 312, 0, SLIDE_H), divider: num(saved.hang?.divider, 624, 0, SLIDE_H) },
    headerGap: num(saved.headerGap, 56, 0, 400), scale: num(saved.scale, 1.6, 0.8, 3),
    styles: saved.styles || {}, space: saved.space || {}, logo: saved.logo || {},
    title: { ...look(cover, t, placeTo), heading: t?.heading, sub: t?.sub, meta: t?.meta },
    divider: { ...look({ ...cover, valign: 'hang', logo: 'none' }, d, placeTo), number: d?.number ?? true, intro: d?.intro ?? true },
    section: look({ bg: '#ffffff', ink: '#111111', align: 'left', valign: 'hang', logo: 'none', header: true, pageNumber: true, fit: 'cover', focus: [50, 50], dim: 0 }, saved.section, (p) => (p === 'centre' ? 'centre' : p === 'top' ? 'hang' : undefined)),
    slides, dividers: saved.dividers || {}, skip: saved.skip || []
  };
}

/** Every stored picture the settings use (title and slide backgrounds), so the page can sign them */
export function pdfPaths(content: unknown): string[] {
  const p = (content as { pdf?: Partial<PdfSettings> } | null)?.pdf; if (!p) return [];
  return [p.title?.image, p.divider?.image, p.section?.image, ...Object.values(p.slides || {}).map((s) => s?.image)].filter((x): x is string => !!x);
}

/** The type styles: the guide's styles at slide sizes, with the studio's changes */
export function resolveStyles(cfg: Pick<PdfSettings, 'styles'>, sys?: GuideSystem | null): Record<StyleId, PdfStyle> {
  const caseOf = (c?: string): PdfCase => (c === 'upper' || c === 'lower' || c === 'sentence' || c === 'title' || c === 'smallcaps' ? c : 'none');
  return Object.fromEntries(STYLE_IDS.map((id) => {
    const b = BASE[id], g = sys?.type?.[b.from];
    const d: PdfStyle = { name: b.name, font: g?.font || (b.from.startsWith('h') ? 'display' : 'body'), size: b.size, weight: g?.weight || 400,
      leading: g?.leading || (b.size > 60 ? 1 : 1.4), tracking: g?.tracking ?? 0, case: caseOf(g?.case) };
    // Big type reads tighter than the guide's web sizes; body copy keeps the guide's leading
    if (id === 'title' || id === 'divider' || id === 'statement') d.leading = Math.min(d.leading, 1.02);
    if (id === 'body' || id === 'small') d.leading = Math.max(d.leading, 1.4);
    return [id, { ...d, ...(cfg.styles[id] || {}), name: b.name }];
  })) as Record<StyleId, PdfStyle>;
}
export const defaultStyles = (sys?: GuideSystem | null) => resolveStyles({ styles: {} }, sys);
export const caseCss = (c: PdfCase) => `text-transform: ${c === 'upper' ? 'uppercase' : c === 'lower' || c === 'sentence' ? 'lowercase' : c === 'title' ? 'capitalize' : 'none'}; font-variant-caps: ${c === 'smallcaps' ? 'all-small-caps' : 'normal'};`;

// Where each guide style applies in a section (as in the guide's own CSS), and which deck style sets it on a slide
const WHERE: [TypeId, StyleId, string[]][] = [
  ['h1', 'statement', ['.gb-h.xl', '.gb-div-h', '.gb-stmt-h', '.gb-cover .gb-h']], ['h2', 'headline', ['.gb-h']], ['h3', 'frame', ['.gc-h', '.gb-xh']], ['h4', 'frame', ['.gi-h']],
  ['h5', 'subhead', ['.gb-body.lg', '.gb-stmt-sub']], ['h6', 'label', ['.gi-label']], ['body', 'body', ['.gb-body']], ['body', 'small', ['.gi-body', '.gc-body']],
  ['caption', 'caption', ['.gb-eb', '.gc-label', '.gb-cap', '.gb-div-n', '.gb-fig figcaption']]
];
const TS_STYLE: Record<TypeId, StyleId> = { h1: 'statement', h2: 'headline', h3: 'frame', h4: 'frame', h5: 'subhead', h6: 'label', body: 'body', caption: 'caption' };
const fam = (role: string) => `var(--font-${role}, ${role === 'display' ? 'var(--pt-display, inherit)' : role === 'body' ? 'var(--pt-body, inherit)' : 'inherit'})`;

/** The guide's design system on a slide: its text styles at the deck's sizes, and its spacing rules (with the PDF's
 *  changes). Sections are drawn at 1/scale and zoomed up, so sizes here are divided by the scale. */
export function slideSysCss(styles: Record<StyleId, PdfStyle>, space: Record<string, number>, scale: number): string {
  const S = '.pd3-g.pd3-g';
  const decl = (s: PdfStyle) => `font-family: ${fam(s.font)}; font-weight: ${s.weight}; font-size: ${Math.round((s.size / scale) * 100) / 100}px; line-height: ${s.leading}; letter-spacing: ${s.tracking}em; ${caseCss(s.case)}`;
  return [
    `.pd3-g { ${Object.entries(space).map(([k, v]) => `--sp-${k}: ${v}px;`).join(' ')} }`,
    `${S} :is(.gb-body, .gi-body, .gc-body) p { font: inherit; letter-spacing: inherit; text-transform: inherit; }`,
    ...WHERE.map(([, id, sel]) => `${sel.map((w) => `${S} ${w}`).join(', ')} { ${decl(styles[id])} }`),
    ...WHERE.filter(([, id]) => styles[id].case === 'sentence').map(([, , sel]) => `${sel.map((w) => `${S} ${w}::first-letter`).join(', ')} { text-transform: uppercase; }`),
    ...(Object.keys(TS_STYLE) as TypeId[]).map((t) => `${S} .ts-${t}.ts-${t} { ${decl(styles[TS_STYLE[t]])} }`)
  ].join('\n');
}

/** Every picture in a section, in order: its images, then its frames' */
export function blockImages(b: Block): BlockMedia[] {
  const out: BlockMedia[] = [...(b.media || []).filter((m) => !m.video)];
  for (const it of b.items || []) {
    if (it.media && !it.media.video) out.push(it.media);
    for (const e of it.els || []) if (e.kind === 'image' && e.media && !e.media.video) out.push(e.media);
  }
  return out;
}

// ---------- Merging a slide's changes over the guide's section, and working out the changes from an edited section
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const ITEMISH = new Set(['columns', 'grid', 'carousel']);
const PLAIN = new Set(['text', 'split', 'media', 'image', 'statement']);
/** Whether a section can take another layout without its words and pictures being rearranged (which only the guide can do) */
export function canBecome(b: Block, kind: Block['kind']): boolean {
  if (kind === b.kind) return true;
  if (ITEMISH.has(b.kind) && ITEMISH.has(kind)) return !!(b.items || []).length || kind !== 'carousel';
  return PLAIN.has(b.kind) && PLAIN.has(kind);
}
/** A frame's look from the PDF, with any picture in it kept linked to the guide's (a picture only the PDF has is dropped) */
function linkLook(master: FrameLook | undefined, ov: FrameLook): FrameLook {
  const f = ov.fill;
  if (f && (f.type === 'image' || f.type === 'video')) {
    const mf = master?.fill;
    if (mf && (mf.type === 'image' || mf.type === 'video')) return { ...ov, fill: mf };
    const { fill: _f, ...rest } = ov; void _f; return rest;
  }
  return ov;
}
const put = <T extends object>(o: T, k: string, v: unknown) => { const r = o as Record<string, unknown>; if (v === null) delete r[k]; else if (v !== undefined) r[k] = v; };

/** The guide's section with the slide's changes over it. Changes that point at something the guide no longer has are
 *  ignored. Hidden frames, texts and pictures are left out, so the result is what the slide shows. */
export function mergeBlock(master: Block, ov?: BlockOv): Block {
  const b: Block = { ...master, hidden: false, draft: undefined };
  if (!ov) return b;
  for (const k of SECTION_KEYS) if (k in ov) put(b, k, ov[k]);
  if (b.kind !== master.kind && !canBecome(master, b.kind)) b.kind = master.kind;
  if (ov.styles) { const st = { ...(master.styles || {}) }; for (const [k, v] of Object.entries(ov.styles)) { if (v && Object.keys(v).length) st[k] = v; else delete st[k]; } b.styles = st; }
  for (const f of ov.hide || []) { if (f === 'eyebrow' || f === 'heading' || f === 'body') b[f] = undefined; else if (f.startsWith('x-')) b.extras = (b.extras || []).filter((x) => 'x-' + x.id !== f); }
  if (master.items) {
    let items = master.items.map((it) => {
      const io = ov.items?.[it.id]; if (!io) return it;
      const n: BlockItem = { ...it };
      for (const k of ITEM_KEYS) if (k in io) put(n, k, io[k]);
      if (io.look) n.look = linkLook(it.look, io.look);
      if (io.hidden) n.hidden = true;
      for (const f of io.hide || []) { if (f === 'label' || f === 'heading' || f === 'body') n[f] = undefined; else if (f === 'media') n.media = undefined; }
      if (io.els && it.els) n.els = it.els.map((e) => {
        const eo = io.els![e.id]; if (!eo) return e;
        const ne = { ...e };
        for (const k of EL_KEYS) if (k in eo) put(ne, k, eo[k]);
        if (eo.look) ne.look = linkLook(e.look, eo.look);
        if (eo.hidden) ne.hidden = true;
        return ne;
      });
      return n;
    });
    if (ov.itemOrder?.length) { const at = new Map(ov.itemOrder.map((id, i) => [id, i])); items = [...items].sort((x, y) => (at.get(x.id) ?? 1e6) - (at.get(y.id) ?? 1e6)); }
    b.items = items;
  }
  if (master.media && ov.media) b.media = master.media.map((m) => { const mo = ov.media![m.path]; return !mo ? m : { ...m, ...(mo.look ? { look: linkLook(m.look, mo.look) } : {}), ...(mo.hidden ? { path: '' } : {}) }; });
  return b;
}
/** What the slide shows: the merged section without hidden frames and elements. Hidden pictures keep their place in
 *  the list (with no file), so picture numbers stay the guide's. */
export function visibleBlock(b: Block): Block {
  return { ...b, items: b.items?.filter((i) => !i.hidden).map((i) => (i.els ? { ...i, els: i.els.filter((e) => !e.hidden) } : i)) };
}

/** The slide's changes, worked out from the section as edited in the PDF against the guide's. Only layout and
 *  formatting are kept: changes to words, pictures or which frames exist belong to the guide and are dropped, and a
 *  frame, text or picture that's missing from the edit is hidden in the PDF. */
export function diffBlock(master: Block, next: Block, prev?: BlockOv): BlockOv | undefined {
  const ov: BlockOv = {};
  const o = ov as Record<string, unknown>, m = master as unknown as Record<string, unknown>, n = next as unknown as Record<string, unknown>;
  for (const k of SECTION_KEYS) if (!same(m[k], n[k])) o[k] = n[k] === undefined ? null : n[k];
  if (ov.kind && !canBecome(master, ov.kind)) delete ov.kind;
  const keys = new Set([...Object.keys(master.styles || {}), ...Object.keys(next.styles || {})]);
  for (const k of keys) { const a = master.styles?.[k], b = next.styles?.[k]; if (!same(a && Object.keys(a).length ? a : undefined, b && Object.keys(b).length ? b : undefined)) (ov.styles ||= {})[k] = b || {}; }
  const hide = (['eyebrow', 'heading', 'body'] as const).filter((f) => master[f] && !next[f]) as string[];
  for (const x of master.extras || []) if (!(next.extras || []).some((y) => y.id === x.id)) hide.push('x-' + x.id);
  // Hidden texts stay hidden while the slide keeps hiding them (the edited section never has them to compare)
  for (const f of prev?.hide || []) if (!hide.includes(f)) hide.push(f);
  if (hide.length) ov.hide = hide;
  if (master.items) {
    const nextItems = next.items || [];
    for (const it of master.items) {
      const ni = nextItems.find((x) => x.id === it.id);
      const io: ItemOv = {};
      if (!ni) { if (!it.hidden) { io.hidden = true; ov.items = { ...(ov.items || {}), [it.id]: io }; } continue; }
      const a = it as unknown as Record<string, unknown>, b = ni as unknown as Record<string, unknown>;
      for (const k of ITEM_KEYS) if (!same(a[k], b[k])) (io as Record<string, unknown>)[k] = b[k] === undefined ? null : b[k];
      if (!same(it.look, ni.look)) io.look = ni.look || {};
      if (ni.hidden && !it.hidden) io.hidden = true;
      const ih = (['label', 'heading', 'body', 'media'] as const).filter((f) => !it.els && it[f] && !ni[f]) as string[];
      for (const f of prev?.items?.[it.id]?.hide || []) if (!ih.includes(f)) ih.push(f);
      if (ih.length) io.hide = ih;
      if (it.els) for (const e of it.els) {
        const ne = (ni.els || []).find((x) => x.id === e.id);
        const eo: ElOv = {};
        if (!ne) { if (!e.hidden) eo.hidden = true; }
        else {
          const ea = e as unknown as Record<string, unknown>, eb = ne as unknown as Record<string, unknown>;
          for (const k of EL_KEYS) if (!same(ea[k], eb[k])) (eo as Record<string, unknown>)[k] = eb[k] === undefined ? null : eb[k];
          if (!same(e.look, ne.look)) eo.look = ne.look || {};
          if (ne.hidden && !e.hidden) eo.hidden = true;
        }
        if (Object.keys(eo).length) io.els = { ...(io.els || {}), [e.id]: eo };
      }
      if (Object.keys(io).length) ov.items = { ...(ov.items || {}), [it.id]: io };
    }
    const order = nextItems.map((x) => x.id).filter((id) => master.items!.some((y) => y.id === id));
    const base = master.items.map((x) => x.id).filter((id) => order.includes(id));
    if (!same(order, base)) ov.itemOrder = order;
  }
  if (master.media) for (const [k, mm] of master.media.entries()) {
    if (!mm.path) continue;
    const nm = (next.media || [])[k];
    const mo: MediaOv = {};
    if (!nm || !nm.path) mo.hidden = true;
    else if (!same(mm.look, nm.look)) mo.look = nm.look || {};
    if (prev?.media?.[mm.path]?.hidden) mo.hidden = true;
    if (Object.keys(mo).length) ov.media = { ...(ov.media || {}), [mm.path]: mo };
  }
  return Object.keys(ov).length ? ov : undefined;
}

/** A change made in the PDF, for the list of them in the inspector: what it is, where, and how to put it back */
export type OvEntry = { id: string; group: string; label: string; scope: { item?: string; el?: string; text?: string }; drop: (ov: BlockOv) => BlockOv };
const SECTION_LABEL: Partial<Record<SectionKey, string>> = {
  kind: 'Layout', layout: 'Layout', cols: 'Columns', side: 'Image side', textAlign: 'Text beside the image', box: 'Frame style', flow: 'Auto layout', gridCols: 'Grid columns',
  rowH: 'Row height', gap: 'Gap', gapX: 'Gap between frames', gapY: 'Gap between rows', pad: 'Padding in frames', boxAlign: 'Alignment in frames', boxGap: 'Gap inside frames',
  boxBg: 'Frame fill', order: 'Order of parts', variant: 'Carousel slides', ratio: 'Shape', full: 'Width', headSize: 'Headline size', bodySize: 'Text size', bodyCols: 'Text columns',
  align: 'Alignment', bg: 'Fill', ink: 'Text colour', gapBefore: 'Space between parts'
};
const ITEM_LABEL: Record<string, string> = { w: 'Width', h: 'Height', align: 'Alignment', gap: 'Gap', pad: 'Padding', box: 'Style', look: 'Fill, stroke and shape', hidden: 'Left out of the PDF' };
const FIELD: Record<string, string> = { eyebrow: 'Label', heading: 'Headline', body: 'Text', label: 'Label', media: 'Picture' };
const strip = <T extends object>(o: T, k: string): T => { const c = { ...o } as Record<string, unknown>; delete c[k]; return c as T; };
const clean = (ov: BlockOv): BlockOv => {
  const c: BlockOv = { ...ov };
  if (c.items) { const it = Object.fromEntries(Object.entries(c.items).map(([k, v]) => [k, v.els && !Object.keys(v.els).length ? strip(v, 'els') : v]).filter(([, v]) => Object.keys(v as object).length)); if (Object.keys(it).length) c.items = it; else delete c.items; }
  for (const k of ['styles', 'media'] as const) if (c[k] && !Object.keys(c[k]!).length) delete c[k];
  if (c.hide && !c.hide.length) delete c.hide;
  return c;
};
/** Every change on a slide, readable, each with a way to drop it */
export function ovEntries(ov: BlockOv | undefined, master: Block): OvEntry[] {
  if (!ov) return [];
  const out: OvEntry[] = [];
  const itemName = (id: string) => { const i = (master.items || []).findIndex((x) => x.id === id); const it = master.items?.[i]; return `Frame ${i + 1}${it?.name ? ` (${it.name})` : ''}`; };
  const textName = (k: string) => { if (k.includes('.')) { const [iid, f] = k.split('.'); const it = master.items?.find((x) => x.id === iid); const e = it?.els?.find((x) => x.id === f); return `${itemName(iid)} · ${FIELD[e?.kind || f] || (e?.kind ? e.kind[0].toUpperCase() + e.kind.slice(1) : 'Text')}`; } return k.startsWith('x-') ? 'Added text' : FIELD[k] || k; };
  // Changes the guide's section can no longer take (a layout it can't become, texts it no longer has) are left out: they're ignored when it's drawn
  const texts = new Set(textKeys(master));
  for (const k of SECTION_KEYS) if (k in ov && !(k === 'kind' && ov.kind && !canBecome(master, ov.kind))) out.push({ id: k, group: 'Section', label: SECTION_LABEL[k] || k, scope: {}, drop: (o) => clean(strip(o, k)) });
  if (ov.itemOrder) out.push({ id: 'itemOrder', group: 'Section', label: 'Order of frames', scope: {}, drop: (o) => clean(strip(o, 'itemOrder')) });
  for (const f of ov.hide || []) if (texts.has(f)) out.push({ id: 'hide:' + f, group: 'Section', label: `${textName(f)} left out of the PDF`, scope: { text: f }, drop: (o) => clean({ ...o, hide: (o.hide || []).filter((x) => x !== f) }) });
  for (const k of Object.keys(ov.styles || {})) if (texts.has(k)) out.push({ id: 'st:' + k, group: k.includes('.') ? itemName(k.split('.')[0]) : 'Text', label: `${textName(k)}: text style`, scope: k.includes('.') ? { item: k.split('.')[0], text: k } : { text: k },
    drop: (o) => clean({ ...o, styles: strip(o.styles || {}, k) }) });
  for (const [id, io] of Object.entries(ov.items || {})) {
    if (!master.items?.some((x) => x.id === id)) continue;
    const g = itemName(id);
    const dropItem = (f: (i: ItemOv) => ItemOv) => (o: BlockOv) => clean({ ...o, items: { ...(o.items || {}), [id]: f((o.items || {})[id] || {}) } });
    for (const k of [...ITEM_KEYS, 'look', 'hidden'] as const) if (k in io) out.push({ id: `it:${id}:${k}`, group: g, label: ITEM_LABEL[k], scope: { item: id }, drop: dropItem((i) => strip(i, k)) });
    for (const f of io.hide || []) out.push({ id: `it:${id}:hide:${f}`, group: g, label: `${FIELD[f] || f} left out of the PDF`, scope: { item: id, text: `${id}.${f}` }, drop: dropItem((i) => ({ ...i, hide: (i.hide || []).filter((x) => x !== f) })) });
    for (const [eid, eo] of Object.entries(io.els || {})) {
      const e = master.items?.find((x) => x.id === id)?.els?.find((x) => x.id === eid); if (!e) continue;
      const nm = e.name || (e.kind === 'frame' ? 'Frame inside' : e.kind[0].toUpperCase() + e.kind.slice(1));
      for (const k of Object.keys(eo)) out.push({ id: `el:${id}:${eid}:${k}`, group: g, label: `${nm}: ${k === 'hidden' ? 'left out of the PDF' : k === 'look' ? 'fill, stroke and shape' : k}`, scope: { item: id, el: `${id}.${eid}` },
        drop: dropItem((i) => ({ ...i, els: { ...(i.els || {}), [eid]: strip((i.els || {})[eid] || {}, k) } })) });
    }
  }
  for (const [p, mo] of Object.entries(ov.media || {})) {
    const k = (master.media || []).findIndex((x) => x.path === p); if (k < 0) continue;
    for (const key of Object.keys(mo)) out.push({ id: `md:${p}:${key}`, group: `Picture ${k + 1}`, label: key === 'hidden' ? 'Left out of the PDF' : 'Fit, crop and frame', scope: { el: 'img:' + k },
      drop: (o) => clean({ ...o, media: { ...(o.media || {}), [p]: strip((o.media || {})[p] || {}, key) } }) });
  }
  return out;
}
/** A slide's changes, tidied: empty groups dropped, and nothing left means no changes */
export const tidyOv = (ov: BlockOv | undefined) => { if (!ov) return undefined; const c = clean(ov); return Object.keys(c).length ? c : undefined; };

/** Which section texts sit in the header above the hang line: the label and headline, and the introduction of a section
 *  whose body is frames, cards or swatches. A statement is all one piece and hangs as a whole. */
export function headerParts(b: Block): { eyebrow: boolean; heading: boolean; body: boolean } {
  if (b.kind === 'statement') return { eyebrow: false, heading: false, body: false };
  const intro = ITEMISH.has(b.kind) || b.kind === 'swatches';
  return { eyebrow: !!b.eyebrow, heading: !!b.heading, body: intro && !!b.body };
}
/** The section's body: what hangs from the hang line, without the parts that sit in the header */
export function bodyBlock(b: Block): Block {
  const h = headerParts(b);
  return { ...b, eyebrow: h.eyebrow ? undefined : b.eyebrow, heading: h.heading ? undefined : b.heading, body: h.body ? undefined : b.body };
}

export const clampSpan = ([a, b]: Span, cols: number): Span => { const s = Math.max(1, Math.min(cols, Math.round(a))); return [s, Math.max(s, Math.min(cols, Math.round(b)))]; };
/** A span drawn for 12 columns, on a grid with another number of columns */
const scale12 = ([a, b]: Span, cols: number): Span => { const s = Math.max(1, Math.min(cols, Math.round(((a - 1) * cols) / 12) + 1)); return [s, Math.max(s, Math.min(cols, Math.round((b * cols) / 12)))]; };

export type SlideRef = { kind: 'title' } | { kind: 'divider'; chapter: string; n: number } | { kind: 'section'; chapter: string; block: string };
const LOOK_KEYS: (keyof Look)[] = ['bg', 'ink', 'align', 'valign', 'logo', 'header', 'pageNumber', 'image', 'fit', 'focus', 'dim'];
/** A slide, worked out: its look (kind, then section, then its own changes), the header and body columns, the hang
 *  line, and whether the section's picture bleeds */
export type Spec = { look: Look; head: Span; body: Span; hangY: number; bleed: boolean; canBleed: boolean; pick: number; mediaFit?: Fit; mediaFocus: [number, number] };
export function slideSpec(cfg: PdfSettings, id: string, kind: SlideRef['kind'], b?: Block): Spec {
  const ov = cfg.slides[id] || {};
  const base: Look = kind === 'title' ? cfg.title : kind === 'divider' ? cfg.divider : cfg.section;
  const canBleed = kind === 'section' && !!b && (b.kind === 'image' || b.kind === 'split' || (b.kind === 'media' && (b.media || []).filter((m) => m.path).length === 1)) && blockImages(b).length > 0;
  const bleed = canBleed && !!ov.bleed;
  // A statement on a colour or a picture takes it as the slide's background; a full-bleed picture takes white words
  const byBlock: Partial<Look> = kind === 'section' && b?.kind === 'statement' && (b.bg || b.backdrop)
    ? { ...(b.bg && HEX6.test(b.bg) ? { bg: b.bg, ink: b.ink && HEX6.test(b.ink) ? b.ink : inkOn(b.bg) } : {}), ...(b.backdrop?.path ? { image: b.backdrop.path, ink: b.ink && HEX6.test(b.ink) ? b.ink : '#ffffff' } : {}) }
    : bleed && b?.kind !== 'split' ? { ink: '#ffffff', header: false } : {};
  const own = Object.fromEntries(LOOK_KEYS.filter((k) => ov[k] !== undefined).map((k) => [k, ov[k]])) as Partial<Look>;
  const look: Look = { ...base, ...byBlock, ...own };
  const cols = cfg.grid.cols;
  const centred = look.align === 'centre';
  const head: Span = ov.head ? clampSpan(ov.head, cols) : kind === 'section' ? scale12(centred ? [2, 11] : [1, 8], cols) : scale12(centred ? [2, 11] : [1, 10], cols);
  const body: Span = ov.body ? clampSpan(ov.body, cols) : kind === 'section' ? [1, cols] : scale12(centred ? [3, 10] : [1, 7], cols);
  return { look, head, body, hangY: kind === 'divider' ? cfg.hang.divider : cfg.hang.content, bleed, canBleed, pick: ov.pick || 0, mediaFit: ov.mediaFit, mediaFocus: ov.mediaFocus || [50, 50] };
}

/** Left edge and width of a run of columns, in slide pixels */
export function spanBox(cfg: PdfSettings, [a, b]: Span) {
  const m = cfg.margins, g = cfg.grid.gutter, n = cfg.grid.cols;
  const colW = (SLIDE_W - m.left - m.right - g * (n - 1)) / n;
  return { left: m.left + (a - 1) * (colW + g), width: (b - a + 1) * colW + (b - a) * g, colW };
}

// ---------- Logos
/** A logo file from the kit: its path, a name, a signed address, and whether it's artwork for dark backgrounds */
export type KitLogo = { key: string; name: string; url: string; light: boolean };
/** The logo for a slide: the slide's own choice, else the document's choice for the background (light artwork on
 *  dark slides), else the kit's first suitable file */
export function logoFor(logos: KitLogo[], cfg: PdfSettings, ink: string, own?: string): KitLogo | undefined {
  if (own) { const l = logos.find((x) => x.key === own); if (l) return l; }
  const dark = isLightInk(ink);
  const want = dark ? cfg.logo.light : cfg.logo.main;
  return logos.find((x) => x.key === want) || (dark ? logos.find((x) => x.light) : logos.find((x) => !x.light)) || logos.find((x) => x.key === cfg.logo.main) || logos[0];
}

/** The section's own texts, for the inspector and the stale-change check */
export const textKeys = (b: Block) => [...(['eyebrow', 'heading', 'body'] as const).filter((f) => b[f]), ...(b.extras || []).map((x) => 'x-' + x.id), ...(b.items || []).flatMap((it) => itemEls(it).map((e) => `${it.id}.${e.id}`))];
