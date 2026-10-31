import { env } from '@/lib/env';

// Reads a Figma guidelines page through the REST API and turns it into a structured, tool-agnostic summary.
// The page is treated as a slide grid: each row of top-level frames is a chapter, the first frame its divider.

type Paint = { type: string; visible?: boolean; opacity?: number; color?: { r: number; g: number; b: number; a: number } };
type Node = {
  id: string; name: string; type: string; visible?: boolean;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  children?: Node[]; characters?: string; fills?: Paint[];
  style?: { fontFamily?: string; fontPostScriptName?: string; fontWeight?: number; fontSize?: number; lineHeightPercentFontSize?: number; letterSpacing?: number; textCase?: string };
};

export type ScanText = { frameId: string; text: string; font: string; size: number; lineHeight: number | null; tracking: number; textCase: string };
export type ScanFrame = { id: string; name: string; x: number; y: number; w: number; h: number; texts: ScanText[]; fills: { hex: string; area: number }[] };
export type ScanChapter = { id: string; title: string; frames: ScanFrame[] };
export type ScanAsset = { id: string; name: string; w: number; h: number; frameId: string; visibleLayers: number };
export type FigmaScan = {
  fileName: string; pageName: string; pageId: string; lastModified: string;
  chapters: ScanChapter[]; colours: { hex: string; opacity: number; count: number; examples?: string[] }[];
  type: { font: string; size: number; lineHeight: number | null; tracking: number; textCase: string; count: number; examples?: string[]; sample?: string }[];
  assets: ScanAsset[]; styles: { name: string; type: string }[];
  stats: { frames: number; texts: number; assets: number };
};

const API = 'https://api.figma.com/v1';
// Figma's API sometimes fails on big requests or when busy (500, 502, 503, 429): retry with a short wait.
async function figma<T>(path: string, tries = 3): Promise<T> {
  let last = '';
  for (let i = 0; i < tries; i++) {
    const r = await fetch(API + path, { headers: { 'X-Figma-Token': env.figmaToken() }, cache: 'no-store' });
    if (r.ok) return r.json() as Promise<T>;
    last = `Figma API ${r.status} on ${path.slice(0, 80)}: ${(await r.text()).slice(0, 160)}`;
    if (![429, 500, 502, 503, 504].includes(r.status)) break;
    await new Promise((w) => setTimeout(w, (r.status === 429 ? 4000 : 1500) * (i + 1)));
  }
  throw new Error(last);
}

export function parseFigmaUrl(url: string): { key: string; nodeId: string | null } | null {
  const m = url.match(/figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]{10,})(?:\/[^?]*)?(?:\?[^#]*node-id=([0-9]+[-:][0-9]+))?/);
  if (!m) return null;
  const branch = url.match(/\/branch\/([A-Za-z0-9]{10,})/);
  return { key: branch ? branch[1] : m[1], nodeId: m[2] ? m[2].replace('-', ':') : null };
}

const hex = (c: { r: number; g: number; b: number }) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const ASSET_NAME = /(logo|wordmark|symbol|lockup|monogram|icon|pattern|texture|mascot|creature)/i;
const GENERIC = /^(frame|group|rectangle|vector|image|ellipse|line|union)\s*\d*$/i;

/** The guidelines page with its full layer tree. */
export async function fetchPage(fileKey: string, pageId: string | null) {
  const meta = await figma<{ name: string; lastModified: string; document: Node; styles: Record<string, { name: string; styleType: string }> }>(`/files/${fileKey}?depth=1`);
  const pages = meta.document.children || [];
  const page = (pageId && pages.find((p) => p.id === pageId)) || pages.find((p) => /brand\s*guide/i.test(p.name)) || pages[0];
  if (!page) throw new Error('The file has no pages.');
  try {
    const full = await figma<{ nodes: Record<string, { document: Node }> }>(`/files/${fileKey}/nodes?ids=${encodeURIComponent(page.id)}`, 2);
    return { meta, page, root: full.nodes[page.id].document };
  } catch {
    // The whole page at once can be too much for Figma: list its slides, then fetch them a few at a time
    const shallow = await figma<{ nodes: Record<string, { document: Node }> }>(`/files/${fileKey}/nodes?ids=${encodeURIComponent(page.id)}&depth=1`);
    const ids = (shallow.nodes[page.id].document.children || []).map((n) => n.id);
    const children: Node[] = [];
    for (let i = 0; i < ids.length; i += 6) {
      const part = await figma<{ nodes: Record<string, { document: Node } | null> }>(`/files/${fileKey}/nodes?ids=${encodeURIComponent(ids.slice(i, i + 6).join(','))}`);
      for (const id of ids.slice(i, i + 6)) { const d = part.nodes[id]?.document; if (d) children.push(d); }
    }
    return { meta, page, root: { ...shallow.nodes[page.id].document, children } };
  }
}

export async function scanFigmaPage(fileKey: string, pageId: string | null, fetched?: Awaited<ReturnType<typeof fetchPage>>): Promise<FigmaScan> {
  const { meta, page, root } = fetched || await fetchPage(fileKey, pageId);

  const tops = (root.children || []).filter((n) => n.visible !== false && n.absoluteBoundingBox && ['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE', 'SECTION'].includes(n.type));
  const colourCount = new Map<string, { hex: string; opacity: number; count: number; examples: string[] }>();
  const typeCount = new Map<string, FigmaScan['type'][number]>();
  const assets: ScanAsset[] = [];
  let textCount = 0;

  const frameFills = new Map<string, Map<string, number>>();
  const walk = (n: Node, frameId: string, out: ScanText[]) => {
    if (n.visible === false) return;
    for (const f of n.fills || []) {
      if (f.type === 'SOLID' && f.visible !== false && f.color) {
        if (n.type !== 'TEXT' && n.id !== frameId && n.absoluteBoundingBox && (f.opacity ?? 1) > 0.99) { const m = frameFills.get(frameId) || new Map(); const hx = hex(f.color); m.set(hx, (m.get(hx) || 0) + n.absoluteBoundingBox.width * n.absoluteBoundingBox.height); frameFills.set(frameId, m); }
        const k = hex(f.color) + '@' + Math.round((f.opacity ?? 1) * 100);
        const e = colourCount.get(k) || { hex: hex(f.color), opacity: Math.round((f.opacity ?? 1) * 100), count: 0, examples: [] };
        e.count++; if (e.examples.length < 3) e.examples.push(n.id); colourCount.set(k, e);
      }
    }
    if (n.type === 'TEXT' && n.characters && n.characters.trim()) {
      const st = n.style || {};
      const t: ScanText = { frameId, text: n.characters.replace(/\s+/g, ' ').trim(), font: `${st.fontFamily || '?'} ${st.fontWeight || ''}`.trim(), size: Math.round((st.fontSize || 0) * 10) / 10, lineHeight: st.lineHeightPercentFontSize ? Math.round(st.lineHeightPercentFontSize) : null, tracking: Math.round((st.letterSpacing || 0) * 100) / 100, textCase: st.textCase || 'ORIGINAL' };
      out.push(t); textCount++;
      const tk = [t.font, t.size, t.lineHeight, t.tracking, t.textCase].join('|');
      const te = typeCount.get(tk) || { font: t.font, size: t.size, lineHeight: t.lineHeight, tracking: t.tracking, textCase: t.textCase, count: 0, examples: [] as string[], sample: t.text.slice(0, 40) };
      te.count++; if (te.examples!.length < 3) te.examples!.push(n.id); typeCount.set(tk, te);
    }
    if ((n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'INSTANCE' || n.type === 'GROUP') && ASSET_NAME.test(n.name) && !GENERIC.test(n.name) && n.absoluteBoundingBox) {
      const visibleLayers = (n.children || []).filter((c) => c.visible !== false).length;
      assets.push({ id: n.id, name: n.name, w: Math.round(n.absoluteBoundingBox.width), h: Math.round(n.absoluteBoundingBox.height), frameId, visibleLayers });
    }
    (n.children || []).forEach((c) => walk(c, frameId, out));
  };

  const frames: ScanFrame[] = tops.map((f) => { const texts: ScanText[] = []; walk(f, f.id, texts); const b = f.absoluteBoundingBox!; const fills = [...(frameFills.get(f.id) || new Map<string, number>()).entries()].map(([hex, area]) => ({ hex, area: Math.round(area) })).sort((x, y) => y.area - x.area).slice(0, 12); return { id: f.id, name: f.name, x: b.x, y: b.y, w: b.width, h: b.height, texts, fills }; });

  // rows → chapters (frames whose top edge is within 40px of each other share a row)
  const slides = frames.filter((f) => f.w >= 800 && f.h >= 450).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: ScanFrame[][] = [];
  for (const f of slides) { const r = rows.find((row) => Math.abs(row[0].y - f.y) < 40); if (r) r.push(f); else rows.push([f]); }
  const chapters: ScanChapter[] = rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    const divider = row[0];
    const title = divider.texts.slice().sort((a, b) => b.size - a.size).slice(0, 2).map((t) => t.text).join(' ').trim() || 'Untitled';
    return { id: divider.id, title, frames: row };
  });

  return {
    fileName: meta.name, pageName: page.name, pageId: page.id, lastModified: meta.lastModified,
    chapters,
    colours: [...colourCount.values()].sort((a, b) => b.count - a.count).slice(0, 60),
    type: [...typeCount.values()].sort((a, b) => b.count - a.count).slice(0, 80),
    assets: dedupeAssets(assets),
    styles: Object.values(meta.styles || {}).map((s) => ({ name: s.name, type: s.styleType })),
    stats: { frames: frames.length, texts: textCount, assets: assets.length }
  };
}

function dedupeAssets(list: ScanAsset[]) {
  // keep the largest instance of each base name ("Tileyard_Logo_Dark 1" and "… 2" are the same asset)
  const by = new Map<string, ScanAsset>();
  for (const a of list) { const k = a.name.replace(/\s+\d+$/, ''); const e = by.get(k); if (!e || a.w * a.h > e.w * e.h) by.set(k, a); }
  return [...by.values()];
}

/** Export layers as SVG/PNG. Returns temporary Figma URLs keyed by node id. */
export async function exportNodes(fileKey: string, ids: string[], format: 'svg' | 'png' | 'jpg', scale = 2) {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const r = await figma<{ images: Record<string, string | null> }>(`/images/${fileKey}?ids=${encodeURIComponent(chunk.join(','))}&format=${format}${format !== 'svg' ? `&scale=${scale}` : '&svg_include_id=false&svg_simplify_stroke=true'}`);
    Object.assign(out, r.images);
  }
  return out;
}
