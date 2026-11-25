// The guidelines as a PDF: 16:9 slides built from the guide, with a title slide, a divider for each chapter and a page
// for each section. The words and pictures always come from the guide; the studio designs the deck here: a grid, a
// hang line everything hangs from, a fixed set of type styles, colours and backgrounds, and a layout per slide.
import type { Block, BlockMedia } from '@/lib/figma/blocks';
import type { GuideSystem, TypeId } from '@/lib/guideSystem';

export const SLIDE_W = 1920, SLIDE_H = 1080;
export type LogoPlace = 'none' | 'top-left' | 'top-right' | 'centre' | 'bottom-left' | 'bottom-right';
export type Align = 'left' | 'centre';
/** Where the words sit down the slide: at the top margin, from the hang line, centred, or on the bottom margin */
export type VAlign = 'top' | 'hang' | 'centre' | 'bottom';
export type Fit = 'cover' | 'contain';
/** A section slide's layout */
export type Layout = 'text' | 'text-image' | 'image-text' | 'image' | 'statement' | 'grid' | 'swatches';
export const LAYOUTS: { id: Layout; name: string }[] = [
  { id: 'text', name: 'Text' }, { id: 'text-image', name: 'Text and image' }, { id: 'image-text', name: 'Image and text' },
  { id: 'image', name: 'Full-bleed image' }, { id: 'statement', name: 'Statement' }, { id: 'grid', name: 'Grid of frames' }, { id: 'swatches', name: 'Swatches' }
];

/** The deck's type styles. Every word on every slide is set in one of them. */
export type StyleId = 'title' | 'divider' | 'statement' | 'headline' | 'subhead' | 'body' | 'small' | 'caption' | 'label';
export type PdfCase = 'none' | 'upper' | 'lower' | 'title' | 'smallcaps';
/** font is a typeface role on the project; size in px of a 1920×1080 slide; leading a line-height multiple; tracking in em */
export type PdfStyle = { name: string; font: string; size: number; weight: number; leading: number; tracking: number; case: PdfCase };
export const STYLE_IDS: StyleId[] = ['title', 'divider', 'statement', 'headline', 'subhead', 'body', 'small', 'caption', 'label'];
export const STYLE_USE: Record<StyleId, string> = {
  title: 'The client’s name on the title slide', divider: 'Chapter names on dividers', statement: 'Statement slides', headline: 'Section headlines',
  subhead: 'Introductions, frame headlines', body: 'Paragraphs', small: 'Text in frames', caption: 'Captions, swatch values, the date', label: 'Labels, chapter numbers, header and page numbers'
};
// Each style starts from one of the guide's own styles (typeface, weight, leading, tracking, case), at a size made for a slide
const BASE: Record<StyleId, { from: TypeId; name: string; size: number }> = {
  title: { from: 'h1', name: 'Title', size: 168 }, divider: { from: 'h1', name: 'Divider', size: 144 }, statement: { from: 'h1', name: 'Statement', size: 104 },
  headline: { from: 'h2', name: 'Headline', size: 72 }, subhead: { from: 'h5', name: 'Subhead', size: 34 }, body: { from: 'body', name: 'Body', size: 24 },
  small: { from: 'body', name: 'Small', size: 19 }, caption: { from: 'caption', name: 'Caption', size: 17 }, label: { from: 'h6', name: 'Label', size: 17 }
};

/** A run of grid columns: the first and the last, counting from 1 */
export type Span = [number, number];
/** How a slide looks. Each kind of slide (title, dividers, content) has a full set; a slide can override any of it. */
export type Look = {
  bg: string; ink: string; align: Align; valign: VAlign; logo: LogoPlace; header: boolean; pageNumber: boolean;
  /** A background picture (a stored path); '' means none */ image?: string; fit: Fit; /** Focal point, % across and down */ focus: [number, number];
  /** How much of the background colour lies over the picture, 0–90 % */ dim: number;
};
/** One slide's own settings, over its kind's */
export type SlideOverrides = Partial<Look> & {
  layout?: Layout;
  /** Grid columns for the headline, the text and the picture */ head?: Span; body?: Span; media?: Span;
  /** The picture runs off the edges of the slide where it meets them */ bleed?: boolean;
  /** Frames per row in a grid */ up?: number;
  /** Which of the section's pictures to show (text and image, full bleed), how it sits and its focal point */
  pick?: number; mediaFit?: Fit; mediaFocus?: [number, number];
};
export type PdfSettings = {
  /** Space around the content on every slide, in pixels of a 1920×1080 slide */
  margins: { top: number; right: number; bottom: number; left: number };
  /** Columns between the margins and the gutter between them */
  grid: { cols: number; gutter: number };
  /** The lines content and dividers hang from, in pixels down the slide */
  hang: { content: number; divider: number };
  /** Changes to the type styles (what's not set follows the guide) */
  styles: Partial<Record<StyleId, Partial<PdfStyle>>>;
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
const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const placeTo = (p: unknown): VAlign | undefined => (p === 'top' ? 'top' : p === 'centre' ? 'centre' : p === 'bottom' ? 'bottom' : undefined);

/** The saved settings, with older saves (templates with a place, margins only) mapped onto the new shape */
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
  return {
    margins: { top: num(m.top, 96, 0, 400), right: num(m.right, 120, 0, 600), bottom: num(m.bottom, 96, 0, 400), left: num(m.left, 120, 0, 600) },
    grid: { cols: num(saved.grid?.cols, 12, 1, 24), gutter: num(saved.grid?.gutter, 32, 0, 200) },
    hang: { content: num(saved.hang?.content, 312, 0, SLIDE_H), divider: num(saved.hang?.divider, 624, 0, SLIDE_H) },
    styles: saved.styles || {},
    title: { ...look(cover, t, placeTo), heading: t?.heading, sub: t?.sub, meta: t?.meta },
    divider: { ...look({ ...cover, valign: 'hang', logo: 'none' }, d, placeTo), number: d?.number ?? true, intro: d?.intro ?? true },
    // The old section template sat its content at the top (now: from the hang line) or in the middle
    section: look({ bg: '#ffffff', ink: '#111111', align: 'left', valign: 'hang', logo: 'none', header: true, pageNumber: true, fit: 'cover', focus: [50, 50], dim: 0 }, saved.section, (p) => (p === 'centre' ? 'centre' : p === 'top' ? 'hang' : undefined)),
    slides: saved.slides || {}, dividers: saved.dividers || {}, skip: saved.skip || []
  };
}

/** Every stored picture the settings use (title and slide backgrounds), so the page can sign them */
export function pdfPaths(content: unknown): string[] {
  const p = (content as { pdf?: Partial<PdfSettings> } | null)?.pdf; if (!p) return [];
  return [p.title?.image, p.divider?.image, p.section?.image, ...Object.values(p.slides || {}).map((s) => s?.image)].filter((x): x is string => !!x);
}

/** The type styles: the guide's styles at slide sizes, with the studio's changes */
export function resolveStyles(cfg: PdfSettings, sys?: GuideSystem | null): Record<StyleId, PdfStyle> {
  const caseOf = (c?: string): PdfCase => (c === 'upper' || c === 'lower' || c === 'title' || c === 'smallcaps' ? c : 'none');
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
export const defaultStyles = (sys?: GuideSystem | null) => resolveStyles({ styles: {} } as PdfSettings, sys);

/** Every picture in a section, in order: its images, then its frames' */
export function blockImages(b: Block): BlockMedia[] {
  const out: BlockMedia[] = [...(b.media || []).filter((m) => !m.video)];
  for (const it of b.items || []) {
    if (it.media && !it.media.video) out.push(it.media);
    for (const e of it.els || []) if (e.kind === 'image' && e.media && !e.media.video) out.push(e.media);
  }
  return out;
}

/** The layout a section gets unless the studio picks another, from what's in it */
export function autoLayout(b: Block): Layout {
  const imgs = blockImages(b);
  const words = (b.heading || '').length + (b.body || '').length;
  if (b.swatches?.length) return 'swatches';
  if (b.kind === 'statement') return 'statement';
  if ((b.items?.length || 0) >= 2) return 'grid';
  if ((b.media?.length || 0) >= 2) return 'grid';
  if (imgs.length === 1 && !b.body && (b.heading || '').length < 80) return 'image';
  if (imgs.length) return b.side === 'left' ? 'image-text' : 'text-image';
  if (!b.body && (b.heading || '').length > 0 && (b.heading || '').length < 140) return 'statement';
  return words ? 'text' : 'text';
}

/** A span drawn for 12 columns, on a grid with another number of columns */
const scale = ([a, b]: Span, cols: number): Span => { const s = Math.max(1, Math.min(cols, Math.round(((a - 1) * cols) / 12) + 1)); return [s, Math.max(s, Math.min(cols, Math.round((b * cols) / 12)))]; };
export const clampSpan = ([a, b]: Span, cols: number): Span => { const s = Math.max(1, Math.min(cols, Math.round(a))); return [s, Math.max(s, Math.min(cols, Math.round(b)))]; };

export type Zones = { head: Span; body: Span; media: Span; bleed: boolean; up: number };
/** Where a layout puts the headline, the text and the picture on the grid, before the slide's own changes */
export function layoutZones(layout: Layout, cols: number, b: Block | undefined, align: Align): Zones {
  const n = Math.max(b?.items?.length || 0, (b?.items?.length ? 0 : b?.media?.length) || 0, b?.swatches?.length || 0);
  const up = layout === 'swatches' ? Math.min(Math.max(n, 1), 6) : Math.min(Math.max(n <= 4 ? n : n % 3 === 0 ? 3 : 4, 1), 4);
  const z = (head: Span, body: Span, media: Span, bleed = false): Zones => ({ head: scale(head, cols), body: scale(body, cols), media: scale(media, cols), bleed, up });
  const centred = align === 'centre';
  switch (layout) {
    case 'text-image': return z([1, 5], [1, 5], [7, 12], true);
    case 'image-text': return z([8, 12], [8, 12], [1, 6], true);
    case 'image': return centred ? z([2, 11], [3, 10], [1, 12], true) : z([1, 8], [1, 6], [1, 12], true);
    case 'statement': return centred ? z([2, 11], [3, 10], [1, 12]) : z([1, 10], [1, 6], [1, 12]);
    case 'grid': case 'swatches': return centred ? z([3, 10], [3, 10], [1, 12]) : b?.body && b.body.length > 160 ? z([1, 5], [7, 11], [1, 12]) : z([1, 7], [1, 6], [1, 12]);
    default: return centred ? z([2, 11], [3, 10], [1, 12]) : b?.body ? z([1, 5], [7, 11], [1, 12]) : z([1, 9], [1, 9], [1, 12]);
  }
}

export type SlideRef = { kind: 'title' } | { kind: 'divider'; chapter: string; n: number } | { kind: 'section'; chapter: string; block: string };
const LOOK_KEYS: (keyof Look)[] = ['bg', 'ink', 'align', 'valign', 'logo', 'header', 'pageNumber', 'image', 'fit', 'focus', 'dim'];
/** A slide, worked out: its look (kind, then layout, then its own changes), layout, grid zones and hang line */
export type Spec = { look: Look; layout: Layout; auto: Layout; zones: Zones; hangY: number; pick: number; mediaFit?: Fit; mediaFocus: [number, number] };
export function slideSpec(cfg: PdfSettings, id: string, kind: SlideRef['kind'], b?: Block): Spec {
  const ov = cfg.slides[id] || {};
  const base: Look = kind === 'title' ? cfg.title : kind === 'divider' ? cfg.divider : cfg.section;
  const auto = b ? autoLayout(b) : 'text';
  const layout = kind === 'section' ? ov.layout || auto : 'text';
  // A full-bleed picture takes white words at the bottom unless the slide says otherwise
  const byLayout: Partial<Look> = kind === 'section' && layout === 'image' ? { ink: '#ffffff', valign: 'bottom', header: false } : {};
  const own = Object.fromEntries(LOOK_KEYS.filter((k) => ov[k] !== undefined).map((k) => [k, ov[k]])) as Partial<Look>;
  const look: Look = { ...base, ...byLayout, ...own };
  const cols = cfg.grid.cols;
  const z = kind === 'section' ? layoutZones(layout, cols, b, look.align)
    : { head: scale(look.align === 'centre' ? [2, 11] : [1, 10], cols), body: scale(look.align === 'centre' ? [3, 10] : [1, 7], cols), media: scale([1, 12], cols), bleed: true, up: 1 };
  const zones: Zones = { head: ov.head ? clampSpan(ov.head, cols) : z.head, body: ov.body ? clampSpan(ov.body, cols) : z.body, media: ov.media ? clampSpan(ov.media, cols) : z.media,
    bleed: ov.bleed ?? z.bleed, up: Math.max(1, Math.min(8, ov.up ?? z.up)) };
  return { look, layout, auto, zones, hangY: kind === 'divider' ? cfg.hang.divider : cfg.hang.content, pick: ov.pick || 0, mediaFit: ov.mediaFit, mediaFocus: ov.mediaFocus || [50, 50] };
}

/** Left edge and width of a run of columns, in slide pixels */
export function spanBox(cfg: PdfSettings, [a, b]: Span) {
  const m = cfg.margins, g = cfg.grid.gutter, n = cfg.grid.cols;
  const colW = (SLIDE_W - m.left - m.right - g * (n - 1)) / n;
  return { left: m.left + (a - 1) * (colW + g), width: (b - a + 1) * colW + (b - a) * g, colW };
}
