// Turns one Figma frame (a guidelines "slide") into a responsive web block: heading, text, images,
// colour swatches and a layout, instead of a picture of the slide. Pure function over the REST node tree.

export type FNode = {
  id: string; name: string; type: string; visible?: boolean; opacity?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  children?: FNode[]; characters?: string;
  fills?: { type: string; visible?: boolean; opacity?: number; color?: { r: number; g: number; b: number; a?: number } }[];
  strokes?: { type: string; visible?: boolean; color?: { r: number; g: number; b: number; a?: number } }[]; strokeWeight?: number;
  style?: { fontSize?: number; fontWeight?: number; textCase?: string; fontFamily?: string };
};

/** The layout a section was made with, chosen like a slide layout (the editor's name for it; the kind and its
 *  settings are what render) */
export type SectionLayout = 'cols2' | 'cols3' | 'cols4' | 'carousel' | 'bento' | 'image' | 'split' | 'statement';
/** Text added anywhere in a section (not inside a box): a label, a headline or a paragraph, placed among its parts */
export type SectionText = { id: string; kind: 'label' | 'heading' | 'text'; text: string };
export type BlockKind = 'cover' | 'divider' | 'text' | 'split' | 'media' | 'swatches' | 'columns' | 'grid' | 'statement' | 'image' | 'carousel' | 'spacer';
/** How a group of text or content is held: free-standing, or in a container (corner marks as in the brand's own layouts, a fine outline, or a light fill). */
export type BoxStyle = 'none' | 'corners' | 'outline' | 'fill';
/** One item in a columns or grid section: a small label, a headline, body text and/or an image. Grid items span columns and rows. */
export type TextCase = 'upper' | 'lower' | 'sentence' | 'title' | 'smallcaps';
/** Text styling set in the editor. font is a typeface role on the project; tracking is in em (-0.02 = -2%); leading is a line-height multiple. */
export type TextStyle = { /** One of the guide's text styles (h1–h6, body, caption) instead of the default for this text */ ts?: import('@/lib/guideSystem').TypeId; size?: number; weight?: number; color?: string; font?: string; tracking?: number; leading?: number; case?: TextCase;
  /** Figma's text settings: alignment, decoration, lists, paragraph spacing (px), truncation, wrapping, fill opacity and layer opacity (0–100) */
  align?: 'left' | 'center' | 'right' | 'justify'; decoration?: 'underline' | 'strike'; list?: 'bullet' | 'number'; paraGap?: number; truncate?: boolean; wrap?: 'balance' | 'pretty'; alpha?: number; opacity?: number };
/** One element inside a box, in order: a small label, a headline, text or an image */
/** How a frame looks, as in Figma: a fill (colour, image or video), how an image sits (fill, fit or crop, with zoom
 *  and focal point in %), a stroke, corner radius, padding and a locked shape */
export type FrameLook = {
  fill?: { type: 'colour'; colour: string } | { type: 'image' | 'video'; media: BlockMedia } | { type: 'gradient'; stops: { colour: string; pos: number }[]; angle: number };
  /** Image adjustments, −100 to 100, as in Figma */
  adjust?: { exposure?: number; contrast?: number; saturation?: number; temperature?: number; tint?: number; highlights?: number; shadows?: number };
  fit?: 'fill' | 'fit' | 'crop'; zoom?: number; x?: number; y?: number;
  stroke?: { colour: string; width: number }; radius?: number; pad?: number; ratio?: string;
  /** Sizing, as in Figma: fill the space, hug the content, or a fixed size in pixels */
  sw?: 'fill' | 'hug' | number; sh?: 'fill' | 'hug' | number;
  /** Auto layout of the frame's contents: vertical (default), horizontal, or horizontal wrapping */ flow?: 'col' | 'row' | 'wrap';
  /** Padding across and down, in pixels (overrides pad) */ padX?: number; padY?: number;
  /** Clip content to the frame (default on for frames inside frames) */ clip?: boolean;
  /** Layer opacity and fill opacity, 0–100 */ opacity?: number; fillAlpha?: number;
  /** Stroke opacity and position */ strokeAlpha?: number; strokePos?: 'inside' | 'center' | 'outside';
};
/** One element inside a frame, in order: a label, a headline, text, an image, a spacer, or a frame inside the frame */
export type ItemEl = { id: string; kind: 'label' | 'heading' | 'text' | 'image' | 'spacer' | 'frame' | 'icon'; text?: string; media?: BlockMedia; /** spacer height, or icon size, in pixels */ size?: number; look?: FrameLook;
  /** An icon from a library (Lucide by default), kept as its SVG so it renders anywhere */ icon?: { set: string; name: string; svg: string }; colour?: string };
export type BlockItem = { id: string; label?: string; heading?: string; body?: string; media?: BlockMedia; w?: number; h?: number;
  /** When set, the box's content as a free list of elements (added with the adding bar), instead of the fixed fields */
  els?: ItemEl[];
  /** How the content sits in the box (overrides the section's setting), and the space between its elements in pixels */
  align?: BoxAlign; gap?: number; /** Padding inside this frame, in pixels (overrides the guide's rule) */ pad?: number;
  /** The frame's own fill, stroke and corner radius */ look?: FrameLook };
/** Content alignment inside a box, like Figma's auto layout: x across, y down; 'between' spreads elements evenly */
export type BoxAlign = { x?: 'start' | 'center' | 'end'; y?: 'start' | 'center' | 'end' | 'between' };
/** A box's elements in order, from its free list or from the fixed fields (image, label, headline, text) */
export function itemEls(it: BlockItem): ItemEl[] {
  if (it.els) return it.els;
  return [
    ...(it.media ? [{ id: 'media', kind: 'image' as const, media: it.media }] : []),
    ...(it.label ? [{ id: 'label', kind: 'label' as const, text: it.label }] : []),
    ...(it.heading ? [{ id: 'heading', kind: 'heading' as const, text: it.heading }] : []),
    ...(it.body ? [{ id: 'body', kind: 'text' as const, text: it.body }] : [])
  ];
}
/** All the words in a box */
export const itemWords = (it: BlockItem) => itemEls(it).filter((e) => e.kind !== 'image' && e.kind !== 'spacer' && e.kind !== 'frame' && e.kind !== 'icon').map((e) => e.text).filter(Boolean) as string[];
export type BlockMedia = { path: string; w: number; h: number; caption?: string; kind: 'photo' | 'graphic'; nodeId?: string; /** A video file (MP4 or WebM), played muted on a loop */ video?: boolean };
export type BlockSwatch = { name: string; hex: string; note?: string };
export type Block = {
  id: string; source?: string; kind: BlockKind;
  bg?: string; ink?: string;
  eyebrow?: string; heading?: string; body?: string;
  media?: BlockMedia[]; side?: 'left' | 'right'; cols?: number;
  backdrop?: BlockMedia; // full-bleed image behind the text (chapter dividers, hero slides)
  swatches?: BlockSwatch[];
  items?: BlockItem[]; box?: BoxStyle;
  /** Columns as an auto-layout stack, like Figma: wrap onto new rows or keep one row; items share the width equally or
   *  fill the space left; boxes match the tallest (fill) or fit their content (hug); gap and vertical alignment. */
  flow?: { dir?: 'row' | 'col'; wrap?: boolean; width?: 'equal' | 'fill'; height?: 'fill' | 'hug'; gap?: 's' | 'm' | 'l'; align?: 'start' | 'center' | 'end' };
  /** Grid: number of columns (default 6) and row height */
  gridCols?: number; rowH?: 's' | 'm' | 'l'; gap?: 's' | 'm' | 'l';
  /** Exact spacing in pixels, set in the design panel: between columns, between rows, and inside each box */
  gapX?: number; gapY?: number; pad?: number;
  /** Alignment and element spacing for every box in the section (a box can override it) */
  boxAlign?: BoxAlign; boxGap?: number;
  /** A brand colour for filled boxes */
  boxBg?: string;
  /** Spacer sections: the height of the space, in pixels */
  size?: number;
  /** The order of the section's parts (headline, text, images, boxes), when moved in the editor */
  order?: string[];
  /** Carousel: cards of hero text (from items) or images to click through (from media) */
  variant?: 'cards' | 'images';
  layout?: SectionLayout;
  /** Text placed freely in the section, among its parts (ordered with them in `order` as 'x-<id>') */
  extras?: SectionText[];
  /** Space before a part, in pixels (part key: 'body', 'items', 'media', 'x-<id>'); the default is 20 */
  gapBefore?: Record<string, number>;
  /** A locked shape for the section, like a slide ('16:9'); statements and covers */
  ratio?: '16:9' | '21:9' | '3:2' | '4:3' | '1:1';
  /** Runs edge to edge in the portal */
  full?: boolean;
  /** Per-text styling set in the editor, keyed by field ('heading', 'body', 'eyebrow') or '<itemId>.<field>' */
  styles?: Record<string, TextStyle>;
  /** Text the studio deleted, so it doesn't come back as an empty placeholder */
  off?: string[];
  original?: string; showOriginal?: boolean;
  // Studio text styling: headline size, body size, body columns, alignment
  headSize?: 'S' | 'M' | 'L' | 'XL'; bodySize?: 'S' | 'M' | 'L'; bodyCols?: 1 | 2 | 3; align?: 'left' | 'center';
  hidden?: boolean; edited?: boolean;
  // Written by the platform to fill a gap for the project's tier: 'draft' needs checking, 'missing' needs the studio or client to write it.
  // Both stay out of the client portal until accepted.
  draft?: 'draft' | 'missing'; draftNote?: string; slot?: string;
};
/** An image layer that needs exporting before the block can be shown. */
export type Visual = { nodeId: string; kind: 'photo' | 'graphic'; w: number; h: number; caption?: string; share: number; backdrop?: boolean; item?: string };

type Box = { x: number; y: number; w: number; h: number };
type T = { id: string; text: string; size: number; box: Box; hex: string | null; upper: boolean; lower: boolean };
type V = { id: string; kind: 'photo' | 'graphic'; box: Box };
type R = { id: string; hex: string; box: Box; base?: string; alpha?: number };

const hexOf = (c: { r: number; g: number; b: number }) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const solid = (n: FNode) => (n.fills || []).find((f) => f.type === 'SOLID' && f.visible !== false && (f.opacity ?? 1) > 0.5 && f.color);
// Any visible solid fill with its effective opacity (fill opacity × layer opacity), for tints like "black at 80%"
const tint = (n: FNode) => { const f = (n.fills || []).find((x) => x.type === 'SOLID' && x.visible !== false && x.color); return f ? { color: f.color!, alpha: (f.opacity ?? 1) * (n.opacity ?? 1) } : null; };
const mix = (c: { r: number; g: number; b: number }, a: number, over: string) => { const o = [1, 3, 5].map((i) => parseInt(over.slice(i, i + 2), 16) / 255); return hexOf({ r: c.r * a + o[0] * (1 - a), g: c.g * a + o[1] * (1 - a), b: c.b * a + o[2] * (1 - a) }); };
const BASE_NAMES: Record<string, string> = { '#000000': 'Black', '#FFFFFF': 'White' };
const hasImage = (n: FNode) => (n.fills || []).some((f) => f.type === 'IMAGE' && f.visible !== false);
const hasText = (n: FNode): boolean => n.type === 'TEXT' ? !!n.characters?.trim() : (n.children || []).some((c) => c.visible !== false && hasText(c));
const area = (b: Box) => b.w * b.h;
const HEXRE = /#?\b([0-9A-F]{6})\b/i;
const GRAPHIC = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'GROUP', 'FRAME', 'INSTANCE', 'COMPONENT', 'ELLIPSE', 'STAR', 'POLYGON', 'RECTANGLE', 'REGULAR_POLYGON']);

function clip(b: Box, f: Box): Box | null {
  const x = Math.max(b.x, f.x), y = Math.max(b.y, f.y), r = Math.min(b.x + b.w, f.x + f.w), btm = Math.min(b.y + b.h, f.y + f.h);
  return r > x && btm > y ? { x, y, w: r - x, h: btm - y } : null;
}
const union = (bs: Box[]): Box => { const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y)); return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y }; };
const xOverlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));

/** Short strings that repeat across many frames (page numbers, running headers, footers). */
export function furnitureText(frames: FNode[]) {
  const seen = new Map<string, number>();
  const walk = (n: FNode, out: Set<string>) => { if (n.visible === false) return; if (n.type === 'TEXT' && n.characters) out.add(n.characters.trim()); (n.children || []).forEach((c) => walk(c, out)); };
  for (const f of frames) { const s = new Set<string>(); walk(f, s); s.forEach((t) => seen.set(t, (seen.get(t) || 0) + 1)); }
  const min = Math.max(3, Math.ceil(frames.length * 0.3));
  return new Set([...seen.entries()].filter(([t, n]) => n >= min && t.length < 60).map(([t]) => t));
}

/** Small graphics in the corners that repeat across slides (logos, page marks): page furniture, never content. */
export function furnitureVisuals(frames: FNode[]) {
  const seen = new Map<string, number>();
  const keys = (f: FNode) => { const out = new Set<string>(); const fb = f.absoluteBoundingBox; if (!fb) return out;
    const walk = (n: FNode) => { if (n.visible === false) return; const k = cornerKey(n, fb); if (k) { out.add(k); return; } (n.children || []).forEach(walk); };
    (f.children || []).forEach(walk); return out; };
  for (const f of frames) keys(f).forEach((k) => seen.set(k, (seen.get(k) || 0) + 1));
  const min = Math.max(3, Math.ceil(frames.length * 0.3));
  return new Set([...seen.entries()].filter(([, n]) => n >= min).map(([k]) => k));
}
/** A key for a small non-text element sitting in a corner band of the slide (name, size and corner). */
function cornerKey(n: FNode, fb: { x: number; y: number; width: number; height: number }) {
  const b = n.absoluteBoundingBox; if (!b || n.type === 'TEXT' || hasText(n)) return null;
  if (b.width > fb.width * 0.16 || b.height > fb.height * 0.12) return null;
  if (b.width <= fb.width * 0.012 && b.height <= fb.width * 0.012) return null; // corner marks and dots belong to the layout
  const top = b.y - fb.y < fb.height * 0.12, bottom = fb.y + fb.height - (b.y + b.height) < fb.height * 0.12;
  const left = b.x - fb.x < fb.width * 0.2, right = fb.x + fb.width - (b.x + b.width) < fb.width * 0.2;
  if (!(top || bottom) || !(left || right)) return null;
  return `${n.name}|${Math.round(b.width / 4)}x${Math.round(b.height / 4)}|${top ? 't' : 'b'}${left ? 'l' : 'r'}`;
}

export function frameToBlock(frame: FNode, opts: { cover?: boolean; colour?: boolean; furniture?: Set<string>; furnitureVis?: Set<string> } = {}): { block: Omit<Block, 'original'>; visuals: Visual[] } | null {
  const fb0 = frame.absoluteBoundingBox!;
  const F: Box = { x: fb0.x, y: fb0.y, w: fb0.width, h: fb0.height };
  const FA = area(F);
  const texts: T[] = [], visuals: V[] = [], rects: R[] = [];
  // Containers (cards, panels) that hold text, and the tiny squares some brands put on their corners
  const boxes: { box: Box; stroke: boolean; fill: string | null }[] = [], marks: Box[] = [];
  let bg = solid(frame) ? hexOf(solid(frame)!.color!) : undefined;

  const visit = (n: FNode) => {
    if (n.visible === false || n.opacity === 0) return;
    const b0 = n.absoluteBoundingBox; if (!b0) return;
    const b = clip({ x: b0.x, y: b0.y, w: b0.width, h: b0.height }, F); if (!b) return;
    if (opts.furnitureVis?.size) {
      const k = cornerKey(n, fb0); if (k && opts.furnitureVis.has(k)) return;
      // A header or footer group holding furniture: look inside it rather than taking it whole
      const holds = (x: FNode): boolean => { const kk = cornerKey(x, fb0); return !!(kk && opts.furnitureVis!.has(kk)) || (x.children || []).some(holds); };
      if (n.type !== 'TEXT' && (n.children || []).some(holds)) { (n.children || []).forEach(visit); return; }
    }
    if (n.type !== 'TEXT' && !hasText(n) && b.w <= F.w * 0.012 && b.h <= F.w * 0.012 && Math.abs(b.w - b.h) <= 2) { marks.push(b); return; }
    const stroked = (n.strokes || []).some((s) => s.visible !== false) && (n.strokeWeight ?? 1) > 0;
    if (n.type !== 'TEXT' && area(b) / FA > 0.02 && area(b) / FA < 0.8 && (stroked || solid(n))) boxes.push({ box: b, stroke: stroked, fill: solid(n) ? hexOf(solid(n)!.color!) : null });
    if (n.type === 'TEXT') {
      const text = (n.characters || '').replace(/\u2028/g, '\n').trim();
      if (!text || opts.furniture?.has(text) || !/[\p{L}\p{N}]/u.test(text)) return;
      const s = solid(n);
      texts.push({ id: n.id, text, size: n.style?.fontSize || 14, box: b, hex: s ? hexOf(s.color!) : null, upper: n.style?.textCase === 'UPPER', lower: n.style?.textCase === 'LOWER' });
      return;
    }
    if (n.type === 'LINE') return;
    if (hasImage(n)) { if (area(b) / FA > 0.004) visuals.push({ id: n.id, kind: 'photo', box: b }); return; }
    if (!hasText(n)) {
      const s = solid(n), t = tint(n);
      const shape = n.type === 'RECTANGLE' || n.type === 'ELLIPSE' || ((n.type === 'FRAME' || n.type === 'INSTANCE') && !(n.children || []).some((c) => c.visible !== false));
      if (shape && s && area(b) / FA >= 0.85 && (t?.alpha ?? 1) > 0.99) { bg = hexOf(s.color!); return; }
      if (shape && t && t.alpha > 0.01) { if (area(b) / FA > 0.003) rects.push({ id: n.id, hex: t.alpha > 0.99 ? hexOf(t.color) : mix(t.color, t.alpha, bg || '#FFFFFF'), base: hexOf(t.color), alpha: t.alpha, box: b }); return; }
      if (GRAPHIC.has(n.type) && area(b) / FA > 0.002) visuals.push({ id: n.id, kind: 'graphic', box: b });
      return;
    }
    // A container with text inside: a filled card gives a swatch candidate, then look inside
    const s = solid(n);
    if (s && n.type !== 'TEXT' && area(b) / FA < 0.85 && area(b) / FA > 0.003 && (n.children || []).length <= 6) rects.push({ id: n.id, hex: hexOf(s.color!), box: b });
    (n.children || []).forEach(visit);
  };
  (frame.children || []).forEach(visit);

  const used = new Set<string>();
  // Colour swatches: filled shapes with a hex value written in or just below them
  const swatches: BlockSwatch[] = [];
  for (const r of rects.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)) {
    const near = texts.filter((t) => !used.has(t.id) && xOverlap(t.box, r.box) > Math.min(t.box.w, r.box.w) * 0.5 && t.box.y >= r.box.y - 4 && t.box.y <= r.box.y + r.box.h + Math.max(60, r.box.h * 0.6));
    const hexT = near.find((t) => HEXRE.test(t.text));
    if (!hexT) continue;
    const written = '#' + hexT.text.match(HEXRE)![1].toUpperCase();
    const isTint = (r.alpha ?? 1) < 0.99;
    const hex = isTint ? r.hex : written;
    if (swatches.some((s) => s.hex === hex)) continue;
    const nameT = near.filter((t) => t !== hexT && /[a-z]{3,}/i.test(t.text) && !/\b(rgb|cmyk|pms|pantone|ral)\b/i.test(t.text)).sort((a, b) => b.size - a.size)[0];
    const own = hexT.text.replace(new RegExp(HEXRE.source, 'gi'), '').replace(/\bhex\b[:\s]*/i, '').trim();
    const note = near.filter((t) => t !== hexT && t !== nameT && /\b(rgb|cmyk|pms|pantone|ral)\b/i.test(t.text)).map((t) => t.text.replace(/\n/g, ' · ')).join(' · ');
    const pct = isTint ? Math.round((r.alpha ?? 1) * 100) : null;
    swatches.push({ name: nameT?.text.split('\n')[0] || (pct !== null ? `${BASE_NAMES[r.base!] || r.base} ${pct}%` : /[a-z]{3,}/i.test(own) ? own : hex), hex, note: [pct !== null ? `${r.base} at ${pct}%` : '', note].filter(Boolean).join(' · ') || undefined });
    near.forEach((t) => used.add(t.id));
  }

  // On colour pages, filled tiles are swatches even when no hex is written beside them: the fill is the value
  if (opts.colour) {
    for (const r of rects.filter((x) => area(x.box) / FA > 0.01).sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)) {
      if (swatches.some((s) => s.hex === r.hex) || (bg && r.hex === bg)) continue;
      const near = texts.filter((t) => !used.has(t.id) && xOverlap(t.box, r.box) > Math.min(t.box.w, r.box.w) * 0.5 && t.box.y >= r.box.y - 4 && t.box.y <= r.box.y + r.box.h + Math.max(60, r.box.h * 0.6));
      const nameT = near.filter((t) => /[a-z]{3,}/i.test(t.text) && !/\b(rgb|cmyk|pms|pantone|ral)\b/i.test(t.text)).sort((a, b) => b.size - a.size)[0];
      const note = near.filter((t) => t !== nameT && /\b(rgb|cmyk|pms|pantone|ral)\b|\d+%/i.test(t.text)).map((t) => t.text.replace(/\n/g, ' · ')).join(' · ');
      const pct = (r.alpha ?? 1) < 0.99 ? Math.round((r.alpha ?? 1) * 100) : null;
      swatches.push({ name: nameT?.text.split('\n')[0] || (pct !== null ? `${BASE_NAMES[r.base!] || r.base} ${pct}%` : BASE_NAMES[r.hex] || r.hex), hex: r.hex, note: [pct !== null ? `${r.base} at ${pct}%` : '', note].filter(Boolean).join(' · ') || undefined });
      near.forEach((t) => used.add(t.id));
    }
  }

  // Keep the meaningful images: drop tiny decorations when there are many, and graphics inside photos
  let vis = visuals.filter((v) => !visuals.some((o) => o !== v && o.kind === 'photo' && v.kind === 'graphic' && xOverlap(o.box, v.box) >= v.box.w * 0.9 && v.box.y >= o.box.y && v.box.y + v.box.h <= o.box.y + o.box.h + 1));
  if (vis.length > 8) vis = vis.filter((v) => area(v.box) / FA > 0.01);
  vis = vis.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x).slice(0, 12);
  // A picture filling most of the slide with text on top is a background, not content
  const backdrop = vis.filter((v) => area(v.box) / FA >= 0.55).sort((a, b) => area(b.box) - area(a.box))[0];
  if (backdrop) vis = vis.filter((v) => v !== backdrop && !(xOverlap(v.box, backdrop.box) >= v.box.w * 0.95 && v.kind === 'graphic' && area(v.box) / FA > 0.2));

  // Captions: short text directly under an image
  const caption = new Map<string, string>();
  for (const v of vis) {
    const under = texts.filter((t) => !used.has(t.id) && xOverlap(t.box, v.box) > t.box.w * 0.5 && t.box.y >= v.box.y + v.box.h - 4 && t.box.y <= v.box.y + v.box.h + F.h * 0.12).sort((a, b) => a.box.y - b.box.y);
    if (under.length && vis.length > 1) { caption.set(v.id, under.slice(0, 2).map((t) => t.text).join(' · ')); under.slice(0, 2).forEach((t) => used.add(t.id)); }
  }

  // Remaining text in reading order: heading, eyebrow, body
  const rest = texts.filter((t) => !used.has(t.id)).sort((a, b) => (Math.abs(a.box.y - b.box.y) < 8 ? a.box.x - b.box.x : a.box.y - b.box.y));
  const sizes = rest.map((t) => t.size).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] || 14;
  const tidy = (t: T) => (t.upper ? t.text.toUpperCase() : t.lower ? t.text.toLowerCase() : t.text);
  let heading: T | undefined = rest.slice().sort((a, b) => b.size - a.size)[0];
  if (heading && rest.length > 1 && heading.size < median * 1.25 && heading.text.length > 80) heading = undefined;
  // Headings set over two or more text layers ("brand" / "elements") read as one
  const headParts = heading ? rest.filter((t) => Math.abs(t.size - heading!.size) <= heading!.size * 0.06 && t.text.length < 80).sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x) : [];
  const joinedHeading = headParts.length > 1 && headParts.length <= 4 ? headParts : heading ? [heading] : [];
  const eyebrow = heading ? rest.find((t) => t !== heading && t.box.y + t.box.h <= heading!.box.y + 4 && t.size <= heading!.size * 0.6 && t.text.length < 48) : undefined;
  const bodyTexts = rest.filter((t) => !joinedHeading.includes(t) && t !== eyebrow);
  const ink = heading?.hex || rest[0]?.hex || undefined;

  // Layout
  if (!rest.length && !vis.length && !swatches.length && !backdrop) return null;
  const toVisual = (v: V, isBack = false, item?: string): Visual => ({ nodeId: v.id, kind: v.kind, w: Math.round(v.box.w), h: Math.round(v.box.h), caption: caption.get(v.id), share: area(v.box) / FA, backdrop: isBack || undefined, item });

  // Several groups of text side by side (in containers, or free-standing in columns): a columns or grid section
  if (!opts.cover && swatches.length < 2) {
    const grouped = groupItems({ rest, vis, boxes, marks, F, tidy });
    if (grouped) {
      const block: Omit<Block, 'original'> = {
        id: frame.id, source: frame.id, kind: grouped.kind, ink: ink && ink !== bg ? ink : undefined,
        heading: grouped.title ? tidy(grouped.title) : undefined, body: grouped.intro.map(tidy).join('\n\n') || undefined,
        items: grouped.items, box: grouped.box, cols: grouped.cols, media: []
      };
      const visualsOut = [...grouped.itemVis.map(([v, id]) => toVisual(v, false, id)), ...grouped.looseVis.map((v) => toVisual(v))];
      return { block, visuals: visualsOut };
    }
  }

  const textBox = rest.length ? union(rest.map((t) => t.box)) : null;
  const visBox = vis.length ? union(vis.map((v) => v.box)) : null;
  // Images are shown whole, never with text laid over them: a picture behind text becomes a full-width image with
  // the text set below it. A chapter's opening slide that only repeats the title is dropped.
  if (opts.cover && !vis.length && !backdrop && swatches.length < 2 && rest.length <= 2) return null;
  let kind: BlockKind = swatches.length >= 2 ? 'swatches' : backdrop && !vis.length ? 'image' : !vis.length ? 'text' : 'media';
  if (kind === 'image' && backdrop) vis = [backdrop];
  const otherChars = rest.filter((t) => !joinedHeading.includes(t) && t !== eyebrow).reduce((n, t) => n + t.text.length, 0);
  const bigHead = !!heading && (heading.size >= F.w * 0.03 || rest.length === 1);
  const headWords = joinedHeading.map((t) => t.text).join(' ').split(/\s+/).filter(Boolean).length;
  // A big line on its own: a subsection headline when it's a few words, a statement when it's a sentence
  if (!opts.cover && kind !== 'swatches' && bigHead && vis.length <= 2) {
    if (headWords <= 5 && otherChars <= 40) kind = 'divider';
    else if (headWords > 5 && otherChars <= 140 && !vis.length) kind = 'statement';
  }
  let side: 'left' | 'right' | undefined;
  if (kind === 'media' && textBox && visBox && xOverlap(textBox, visBox) < Math.min(textBox.w, visBox.w) * 0.25) { kind = 'split'; side = visBox.x + visBox.w / 2 > textBox.x + textBox.w / 2 ? 'right' : 'left'; }
  // One wide picture: a full-width image
  if (kind === 'media' && vis.length === 1 && vis[0].box.w >= F.w * 0.6) kind = 'image';
  const rows: V[][] = [];
  for (const v of vis) { const r = rows.find((row) => Math.abs(row[0].box.y - v.box.y) < v.box.h * 0.3); if (r) r.push(v); else rows.push([v]); }
  const cols = Math.max(1, Math.min(4, Math.max(0, ...rows.map((r) => r.length))));
  // Only covers and statements sit on a coloured panel; guidance stands free on the page
  const keepBg = kind === 'statement';
  if (kind === 'divider') vis = [];

  const block: Omit<Block, 'original'> = {
    id: frame.id, source: frame.id, kind,
    bg: keepBg ? bg : undefined, ink: ink && (!keepBg || ink !== bg) ? ink : undefined,
    eyebrow: eyebrow && kind !== 'divider' ? tidy(eyebrow) : undefined,
    heading: joinedHeading.length ? joinedHeading.map(tidy).join(joinedHeading.every((t) => Math.abs(t.box.x - joinedHeading[0].box.x) < 8) ? '\n' : ' ') : undefined,
    body: kind === 'divider' ? undefined : bodyTexts.map(tidy).join('\n\n') || undefined,
    media: [], side, cols: kind === 'media' ? cols : undefined,
    swatches: swatches.length ? swatches : undefined
  };
  const visualsOut = vis.map((v) => toVisual(v));

  return { block, visuals: visualsOut };
}

type GBox = { box: Box; stroke: boolean; fill: string | null };
const inside = (t: Box, c: Box) => t.x >= c.x - 2 && t.y >= c.y - 2 && t.x + t.w <= c.x + c.w + 2 && t.y + t.h <= c.y + c.h + 2;
const uidOf = (s: string) => 'i-' + s.replace(/[^a-z0-9]/gi, '').slice(-10);

/** Finds groups of text that sit side by side (each in its own container, or free-standing in columns) and turns
 *  them into items with a clear hierarchy: a small label, a headline, body text. Returns null for ordinary pages. */
function groupItems({ rest, vis, boxes, marks, F, tidy }: { rest: T[]; vis: V[]; boxes: GBox[]; marks: Box[]; F: Box; tidy: (t: T) => string }) {
  if (rest.length < 2) return null;
  // Containers that hold text; keep the innermost, drop duplicates
  let cards = boxes.filter((c) => rest.some((t) => inside(t.box, c.box))).sort((a, b) => area(a.box) - area(b.box));
  cards = cards.filter((c, i) => !cards.some((o, j) => j < i && inside(o.box, c.box) && rest.filter((t) => inside(t.box, o.box)).length === rest.filter((t) => inside(t.box, c.box)).length));
  cards = cards.filter((c) => !cards.some((o) => o !== c && inside(o.box, c.box)));
  type G = { texts: T[]; box: Box; card?: GBox };
  let groups: G[] = [];
  let title: T | undefined;
  if (cards.length >= 2) {
    groups = cards.map((c) => ({ texts: rest.filter((t) => inside(t.box, c.box)), box: c.box, card: c })).filter((g) => g.texts.length);
  } else {
    // Free-standing: a title above everything, then text grouped by proximity into items
    const top = [...rest].sort((a, b) => a.box.y - b.box.y);
    const biggest = [...rest].sort((a, b) => b.size - a.size)[0];
    if (biggest && biggest === top[0] && biggest.size >= (top[1]?.size || 0) * 1.3) title = biggest;
    for (const t of top.filter((x) => x !== title)) {
      const g = groups.find((gr) => { const last = gr.texts[gr.texts.length - 1]; const gap = t.box.y - (last.box.y + last.box.h); return xOverlap(t.box, last.box) > Math.min(t.box.w, last.box.w) * 0.4 && gap > -4 && gap < Math.max(t.size, last.size) * 2.4; });
      if (g) { g.texts.push(t); g.box = union([g.box, t.box]); } else groups.push({ texts: [t], box: t.box });
    }
    // Needs at least two columns of groups to be a columns or grid section
    const xs = groups.map((g) => g.box.x).sort((a, b) => a - b);
    const distinct = xs.filter((x, i) => i === 0 || x - xs[i - 1] > F.w * 0.08).length;
    if (groups.length < 2 || distinct < 2) return null;
  }
  if (groups.length < 2) return null;
  const loose = rest.filter((t) => t !== title && !groups.some((g) => g.texts.includes(t)));
  if (!title) { const above = loose.filter((t) => groups.every((g) => t.box.y + t.box.h <= g.box.y + 4)).sort((a, b) => b.size - a.size)[0]; if (above) title = above; }
  const intro = loose.filter((t) => t !== title).sort((a, b) => a.box.y - b.box.y);

  // Each group as an item: label on top, the biggest line as its headline, the rest as body
  const items: BlockItem[] = [];
  const itemVis: [V, string][] = [];
  const usedVis = new Set<string>();
  groups.sort((a, b) => (Math.abs(a.box.y - b.box.y) < F.h * 0.06 ? a.box.x - b.box.x : a.box.y - b.box.y));
  for (const g of groups) {
    const ts = [...g.texts].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
    const min = Math.min(...ts.map((t) => t.size));
    const label = ts.length > 1 && ts[0].text.length <= 40 ? ts[0] : undefined;
    const others = ts.filter((t) => t !== label);
    const big = others.filter((t) => t.size >= min * 1.5 && t.text.length <= 120).sort((a, b) => b.size - a.size)[0];
    const heading = big && (others.length > 1 || (label && big.size >= label.size * 1.3)) ? big : others.length === 1 && others[0].size >= F.w * 0.025 ? others[0] : undefined;
    const id = uidOf(ts[0].id);
    const item: BlockItem = { id, label: label ? tidy(label) : undefined, heading: heading ? tidy(heading) : undefined, body: others.filter((t) => t !== heading).map(tidy).join('\n\n') || undefined };
    const v = g.card ? vis.find((x) => !usedVis.has(x.id) && inside(x.box, g.card!.box)) : undefined;
    if (v) { usedVis.add(v.id); itemVis.push([v, id]); }
    (item as BlockItem & { _box?: Box })._box = g.card?.box || g.box;
    items.push(item);
  }
  const looseVis = vis.filter((v) => !usedVis.has(v.id));

  // Columns when the items line up in equal rows; a grid when they don't
  const rows: Box[][] = [];
  for (const it of items) { const b = (it as BlockItem & { _box: Box })._box; const r = rows.find((row) => Math.abs(row[0].y - b.y) < F.h * 0.06); if (r) r.push(b); else rows.push([b]); }
  const counts = rows.map((r) => r.length);
  const widths = items.map((it) => (it as BlockItem & { _box: Box })._box.w);
  const even = counts.every((c) => c === counts[0]) && counts[0] >= 2 && counts[0] <= 4 && Math.max(...widths) / Math.min(...widths) < 1.35;
  const kind: BlockKind = even ? 'columns' : 'grid';
  const all = union(items.map((it) => (it as BlockItem & { _box: Box })._box));
  for (const it of items) {
    const b = (it as BlockItem & { _box?: Box })._box!;
    if (kind === 'grid') { it.w = Math.max(1, Math.min(6, Math.round((b.w / all.w) * 6))); it.h = Math.max(1, Math.min(8, Math.round(b.h / (F.h * 0.1)))); }
    delete (it as BlockItem & { _box?: Box })._box;
  }
  // How the items are held: corner marks, an outline, a fill, or free-standing
  const nearCorner = (m: Box, c: Box) => [[c.x, c.y], [c.x + c.w, c.y], [c.x, c.y + c.h], [c.x + c.w, c.y + c.h]].some(([x, y]) => Math.abs(m.x + m.w / 2 - x) < F.w * 0.012 && Math.abs(m.y + m.h / 2 - y) < F.w * 0.012);
  const withCards = groups.filter((g) => g.card);
  const box: BoxStyle = !withCards.length ? 'none' : withCards.some((g) => marks.filter((m) => nearCorner(m, g.card!.box)).length >= 2) ? 'corners' : withCards.some((g) => g.card!.stroke) ? 'outline' : 'fill';
  return { kind, title, intro, items, itemVis, looseVis, box, cols: kind === 'columns' ? counts[0] : undefined };
}

/** Plain text of a block, for search, the brand chat and the connector. */
export function blockText(b: Block) {
  return [b.eyebrow, b.heading, b.body, ...(b.items || []).flatMap((i) => itemWords(i)), ...(b.media || []).map((m) => m.caption), ...(b.swatches || []).map((s) => `${s.name} ${s.hex}${s.note ? ' ' + s.note : ''}`)].filter(Boolean) as string[];
}

/** Every stored image or video a section uses: backdrop, images, frames' images and fills, and frames inside frames */
export function blockPaths(b: Block): string[] {
  const fill = (l?: FrameLook) => fillMedia(l)?.path;
  return [b.backdrop?.path, ...(b.media || []).map((m) => m.path), ...(b.items || []).flatMap((i) => [i.media?.path, fill(i.look), ...(i.els || []).flatMap((e) => [e.media?.path, fill(e.look)])])].filter(Boolean) as string[];
}

/** The image or video a frame is filled with, if any */
export const fillMedia = (l?: FrameLook): BlockMedia | undefined => (l?.fill && (l.fill.type === 'image' || l.fill.type === 'video') ? l.fill.media : undefined);

/** An SVG made safe to show: no scripts, event handlers, links or foreign content; sized by its frame */
export function cleanSvg(svg: string): string {
  const m = svg.match(/<svg[\s\S]*<\/svg>/i); if (!m) return '';
  return m[0].replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/\s(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '')
    .replace(/<svg([^>]*?)\swidth="[^"]*"/i, '<svg$1').replace(/<svg([^>]*?)\sheight="[^"]*"/i, '<svg$1').replace(/<svg/i, '<svg width="100%" height="100%"');
}
