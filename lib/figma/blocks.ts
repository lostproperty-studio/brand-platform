// Turns one Figma frame (a guidelines "slide") into a responsive web block: heading, text, images,
// colour swatches and a layout, instead of a picture of the slide. Pure function over the REST node tree.

export type FNode = {
  id: string; name: string; type: string; visible?: boolean; opacity?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  children?: FNode[]; characters?: string;
  fills?: { type: string; visible?: boolean; opacity?: number; color?: { r: number; g: number; b: number; a?: number } }[];
  style?: { fontSize?: number; fontWeight?: number; textCase?: string; fontFamily?: string };
};

export type BlockKind = 'cover' | 'divider' | 'text' | 'split' | 'media' | 'swatches';
export type BlockMedia = { path: string; w: number; h: number; caption?: string; kind: 'photo' | 'graphic'; nodeId?: string };
export type BlockSwatch = { name: string; hex: string; note?: string };
export type Block = {
  id: string; source?: string; kind: BlockKind;
  bg?: string; ink?: string;
  eyebrow?: string; heading?: string; body?: string;
  media?: BlockMedia[]; side?: 'left' | 'right'; cols?: number;
  backdrop?: BlockMedia; // full-bleed image behind the text (chapter dividers, hero slides)
  swatches?: BlockSwatch[];
  original?: string; showOriginal?: boolean;
  // Studio text styling: headline size, body size, body columns, alignment
  headSize?: 'S' | 'M' | 'L' | 'XL'; bodySize?: 'S' | 'M' | 'L'; bodyCols?: 1 | 2 | 3; align?: 'left' | 'center';
  hidden?: boolean; edited?: boolean;
};
/** An image layer that needs exporting before the block can be shown. */
export type Visual = { nodeId: string; kind: 'photo' | 'graphic'; w: number; h: number; caption?: string; share: number; backdrop?: boolean };

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

export function frameToBlock(frame: FNode, opts: { cover?: boolean; colour?: boolean; furniture?: Set<string> } = {}): { block: Omit<Block, 'original'>; visuals: Visual[] } | null {
  const fb0 = frame.absoluteBoundingBox!;
  const F: Box = { x: fb0.x, y: fb0.y, w: fb0.width, h: fb0.height };
  const FA = area(F);
  const texts: T[] = [], visuals: V[] = [], rects: R[] = [];
  let bg = solid(frame) ? hexOf(solid(frame)!.color!) : undefined;

  const visit = (n: FNode) => {
    if (n.visible === false || n.opacity === 0) return;
    const b0 = n.absoluteBoundingBox; if (!b0) return;
    const b = clip({ x: b0.x, y: b0.y, w: b0.width, h: b0.height }, F); if (!b) return;
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
  const textBox = rest.length ? union(rest.map((t) => t.box)) : null;
  const visBox = vis.length ? union(vis.map((v) => v.box)) : null;
  let kind: BlockKind = opts.cover || (backdrop && !vis.length && rest.length) ? 'cover' : swatches.length >= 2 ? 'swatches' : !vis.length ? (backdrop && !rest.length ? 'media' : 'text') : 'media';
  if (kind === 'media' && !vis.length && backdrop) vis = [backdrop];
  const otherChars = rest.filter((t) => !joinedHeading.includes(t) && t !== eyebrow).reduce((n, t) => n + t.text.length, 0);
  const bigHead = !!heading && (heading.size >= F.w * 0.03 || rest.length === 1);
  if (!opts.cover && kind !== 'swatches' && bigHead && otherChars <= 140 && vis.length <= 2 && (heading?.text.length || 0) <= 60) kind = 'divider';
  let side: 'left' | 'right' | undefined;
  if (kind === 'media' && textBox && visBox && xOverlap(textBox, visBox) < Math.min(textBox.w, visBox.w) * 0.25) { kind = 'split'; side = visBox.x + visBox.w / 2 > textBox.x + textBox.w / 2 ? 'right' : 'left'; }
  const rows: V[][] = [];
  for (const v of vis) { const r = rows.find((row) => Math.abs(row[0].box.y - v.box.y) < v.box.h * 0.3); if (r) r.push(v); else rows.push([v]); }
  const cols = Math.max(1, Math.min(4, Math.max(0, ...rows.map((r) => r.length))));

  const block: Omit<Block, 'original'> = {
    id: frame.id, source: frame.id, kind,
    bg, ink: ink && ink !== bg ? ink : undefined,
    eyebrow: eyebrow ? tidy(eyebrow) : undefined,
    heading: joinedHeading.length ? joinedHeading.map(tidy).join(joinedHeading.every((t) => Math.abs(t.box.x - joinedHeading[0].box.x) < 8) ? '\n' : ' ') : undefined,
    body: bodyTexts.map(tidy).join('\n\n') || undefined,
    media: [], side, cols: kind === 'media' ? cols : undefined,
    swatches: swatches.length ? swatches : undefined
  };
  const toVisual = (v: V, isBack = false): Visual => ({ nodeId: v.id, kind: v.kind, w: Math.round(v.box.w), h: Math.round(v.box.h), caption: caption.get(v.id), share: area(v.box) / FA, backdrop: isBack || undefined });
  const visualsOut = vis.map((v) => toVisual(v));
  if (backdrop && !vis.includes(backdrop)) visualsOut.push(toVisual(backdrop, true));
  return { block, visuals: visualsOut };
}

/** Plain text of a block, for search, the brand chat and the connector. */
export function blockText(b: Block) {
  return [b.eyebrow, b.heading, b.body, ...(b.media || []).map((m) => m.caption), ...(b.swatches || []).map((s) => `${s.name} ${s.hex}${s.note ? ' ' + s.note : ''}`)].filter(Boolean) as string[];
}
