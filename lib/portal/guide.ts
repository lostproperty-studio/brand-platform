import { adminClient } from '@/lib/supabase/server';
import { exportNodes, fetchPage, scanFigmaPage, type ScanFrame } from '@/lib/figma/scan';
import { blockText, frameToBlock, furnitureText, furnitureVisuals, type Block, type BlockMedia, type FNode, type Visual } from '@/lib/figma/blocks';
import { resolvedText } from '@/lib/kit/fromProject';

// The client-facing guidelines, rebuilt from the Figma page as responsive web content.
// Each row of frames is a chapter; each frame becomes a block (heading, text, images, swatches, layout).
// The studio edits blocks afterwards. On a rebuild, edited and added blocks are kept; untouched ones refresh from Figma.

export type { Block, BlockKind, BlockMedia } from '@/lib/figma/blocks';
export type GuideRule = { title: string; text: string };
export type GuideChapter = { id: string; key: string | null; title: string; kicker: string; lede: string; hidden?: boolean; edited?: boolean; blocks: Block[]; rules: GuideRule[]; /** Added to fill a gap for the tier */ slot?: string;
  /** Deleted by the studio: kept out of the guide, and stays deleted when rebuilt from Figma */ removed?: boolean;
  /** Home page cover: an uploaded thumbnail, the type sample, and the tone-of-voice words */ thumb?: string; thumbSample?: string; thumbWords?: string };
export type GuideColour = { name: string; hex: string; role: string };
export type Guide = { version?: number; generatedAt: string; file: string; page: string; chapters: GuideChapter[]; colours: GuideColour[] };
export const GUIDE_VERSION = 3;

const KEYS: [RegExp, string][] = [
  [/logo|wordmark|marque|symbol|lock-?up|identity/i, 'logo'], [/typo|type|font/i, 'type'], [/colou?r|palette/i, 'colour'],
  [/grid|layout|composition|spacing/i, 'layout'], [/imag|photo|art direction|illustrat|pattern|graphic/i, 'imagery'],
  [/voice|tone|copy|writing|messag|verbal/i, 'voice'], [/icon/i, 'icons'], [/applicat|example|in use|touchpoint/i, 'applications']
];
const CHAPTER_NAMES: Record<string, string> = { logo: 'Logo', type: 'Typography', colour: 'Colour', layout: 'Grid & layout', imagery: 'Imagery', voice: 'Tone of voice' };
const keyFor = (title: string) => KEYS.find(([re]) => re.test(title))?.[1] ?? null;
const clean = (t: string) => t.replace(/^\s*(chapter\s*)?\d{1,2}[.)\s:–-]*/i, '').replace(/\s+/g, ' ').trim();
const HEX = /#?\b([0-9A-F]{6})\b/i;

/** Older guides stored a picture per frame; show those as image blocks until rebuilt. */
export function normaliseGuide(g: Guide | null | undefined): Guide | null {
  if (!g) return null;
  // Cover modules (text laid over a picture) are retired: drop them
  g = { ...g, chapters: g.chapters.map((c) => ({ ...c, blocks: (c.blocks || []).filter((b) => b.kind !== 'cover') })) } as Guide;
  return { ...g, chapters: g.chapters.map((c) => {
    const legacy = (c as unknown as { frames?: { nodeId: string; path: string; w: number; h: number; text: string[]; hidden?: boolean }[] }).frames;
    if (c.blocks || !legacy) return { ...c, blocks: c.blocks || [] };
    return { ...c, blocks: legacy.map((f) => ({ id: f.nodeId, source: f.nodeId, kind: 'text' as const, original: f.path, hidden: f.hidden, body: f.text.join('\n\n'), media: [] })) };
  }) };
}

/** Colour names and values from the blocks (swatches first, then hex codes written in the text). */
export function readColours(blocks: Block[], frames: ScanFrame[]): GuideColour[] {
  const out = new Map<string, GuideColour>();
  for (const b of blocks) for (const s of b.swatches || []) if (!out.has(s.hex)) out.set(s.hex, { name: s.name, hex: s.hex, role: s.note || '' });
  for (const f of frames) {
    const lines = f.texts.map((t) => t.text);
    lines.forEach((line, i) => {
      for (const m of line.matchAll(new RegExp(HEX.source, 'gi'))) {
        const hex = '#' + m[1].toUpperCase();
        if (out.has(hex)) continue;
        const own = line.replace(new RegExp(HEX.source, 'gi'), '').replace(/\b(hex|rgb|cmyk|pms|pantone|ral)\b.*$/i, '').replace(/[:·|,/]+/g, ' ').trim();
        let name = /[a-z]{3,}/i.test(own) && own.length < 40 ? own : '';
        for (let k = i - 1; !name && k >= Math.max(0, i - 3); k--) { const prev = lines[k]; if (/[a-z]{3,}/i.test(prev) && !HEX.test(prev) && !/\b(rgb|cmyk|pms|pantone|ral)\b/i.test(prev) && prev.length < 40) name = prev; }
        out.set(hex, { name: name || hex, hex, role: '' });
      }
    });
  }
  if (out.size) return [...out.values()].slice(0, 16);
  const area = new Map<string, number>();
  for (const f of frames) for (const x of f.fills) area.set(x.hex, (area.get(x.hex) || 0) + x.area);
  return [...area.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([hex]) => ({ name: hex, hex, role: '' }));
}

/** Keeps the studio's work across a rebuild: edited and added blocks stay, the rest refresh. */
function mergeBlocks(fresh: Block[], prev: Block[]): Block[] {
  const prevById = new Map(prev.map((b) => [b.id, b]));
  // Untouched blocks refresh completely from Figma (only whether they're hidden carries over)
  const out = fresh.map((b) => { const p = prevById.get(b.id); return p?.edited ? { ...p, original: b.original } : p ? { ...b, hidden: p.hidden } : b; });
  // Blocks the studio added (no Figma source) go back after the block they followed
  prev.forEach((b, i) => {
    if (b.source) return;
    const after = prev.slice(0, i).reverse().find((x) => out.some((o) => o.id === x.id));
    const at = after ? out.findIndex((o) => o.id === after.id) + 1 : 0;
    out.splice(at, 0, b);
  });
  return out;
}

type Item = Parameters<typeof resolvedText>[0];

/** Reads the Figma page, rebuilds every slide as a web block, exports its images, and stores the guide. */
export async function buildGuide(projectId: string) {
  const sb = adminClient();
  const { data: p, error } = await sb.from('projects').select('figma_key, figma_page_id, content, brand').eq('id', projectId).single();
  if (error) throw error;
  if (!p.figma_key) throw new Error('Link a Figma file first.');
  const fetched = await fetchPage(p.figma_key, p.figma_page_id);
  const scan = await scanFigmaPage(p.figma_key, p.figma_page_id, fetched);
  const nodeById = new Map<string, FNode>(((fetched.root as unknown as FNode).children || []).map((n) => [n.id, n]));
  const slides = scan.chapters.flatMap((c) => c.frames.map((f) => nodeById.get(f.id)).filter(Boolean) as FNode[]);
  const furniture = furnitureText(slides);
  const furnitureVis = furnitureVisuals(slides);

  // 1. Blocks and the image layers they need
  const perChapter = scan.chapters.map((c) => c.frames.map((f, i) => { const n = nodeById.get(f.id); const r = n ? frameToBlock(n, { cover: i === 0, colour: keyFor(clean(c.title)) === 'colour', furniture, furnitureVis }) : null; return r ? { frame: f, ...r } : null; }).filter(Boolean) as { frame: ScanFrame; block: Omit<Block, 'original'>; visuals: Visual[] }[]);
  const all = perChapter.flat();
  const photos = all.flatMap((x) => x.visuals.filter((v) => v.kind === 'photo' || v.share > 0.25));
  const vectors = all.flatMap((x) => x.visuals.filter((v) => v.kind === 'graphic' && v.share <= 0.25));

  // 2. Export: photos and large artwork as images, logos and small graphics as SVG, plus each whole slide for reference
  const [rasterUrls, svgUrls, slideUrls] = await Promise.all([
    exportNodes(p.figma_key, [...new Set(photos.map((v) => v.nodeId))], 'png', 2),
    exportNodes(p.figma_key, [...new Set(vectors.map((v) => v.nodeId))], 'svg'),
    exportNodes(p.figma_key, all.map((x) => x.frame.id), 'jpg', 1.5)
  ]);
  const stamp = Date.now().toString(36);
  const jobs: { key: string; url: string; path: string; type: string }[] = [];
  const safe = (id: string) => id.replace(/[:;]/g, '-');
  for (const [id, url] of Object.entries(rasterUrls)) if (url) jobs.push({ key: id, url, path: `${projectId}/guide/${stamp}/${safe(id)}.png`, type: 'image/png' });
  for (const [id, url] of Object.entries(svgUrls)) if (url) jobs.push({ key: id, url, path: `${projectId}/guide/${stamp}/${safe(id)}.svg`, type: 'image/svg+xml' });
  for (const [id, url] of Object.entries(slideUrls)) if (url) jobs.push({ key: 'slide:' + id, url, path: `${projectId}/guide/${stamp}/slide-${safe(id)}.jpg`, type: 'image/jpeg' });
  const stored: Record<string, string> = {};
  const queue = [...jobs];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let j = queue.shift(); j; j = queue.shift()) {
      try {
        const bytes = new Uint8Array(await (await fetch(j.url)).arrayBuffer());
        const { error: e } = await sb.storage.from('previews').upload(j.path, bytes, { contentType: j.type, upsert: true });
        if (!e) stored[j.key] = j.path;
      } catch { /* a failed image leaves that slot empty; the slide image is still there */ }
    }
  }));

  // 3. Chapters with rules from the review, merged with the studio's earlier edits
  const { data: lastScan } = await sb.from('scans').select('id').eq('project_id', projectId).eq('status', 'done').order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { data: items } = lastScan ? await sb.from('review_items').select('chapter, kind, title, proposal, answer, recommend, status, input, node_id').eq('scan_id', lastScan.id).order('ord') : { data: [] };
  const list = (items || []) as Item[];
  const content = (p.content || {}) as { guide?: Guide };
  const previous = normaliseGuide(content.guide);
  const prevCh = new Map((previous?.chapters || []).map((c) => [c.id, c]));
  const usedKeys = new Set<string>();
  const rulesFor = (key: string | null) => { if (!key || usedKeys.has(key)) return []; usedKeys.add(key); return list.filter((i) => i.chapter === key && i.kind !== 'asset' && i.kind !== 'issue').map((i) => ({ title: i.title, text: resolvedText(i) })).filter((r) => r.text); };

  const chapters: GuideChapter[] = scan.chapters.map((c, ci) => {
    const title = clean(c.title) || 'Untitled';
    const key = keyFor(title);
    const blocks: Block[] = perChapter[ci].map(({ frame, block, visuals }) => {
      const toMedia = (v: Visual): BlockMedia => ({ path: stored[v.nodeId], w: v.w, h: v.h, caption: v.caption, kind: v.kind, nodeId: v.nodeId });
      const media: BlockMedia[] = visuals.filter((v) => !v.backdrop && !v.item && stored[v.nodeId]).map(toMedia);
      const items = block.items?.map((it) => { const v = visuals.find((x) => x.item === it.id && stored[x.nodeId]); return v ? { ...it, media: toMedia(v) } : it; });
      const back = visuals.find((v) => v.backdrop && stored[v.nodeId]);
      return { ...block, items, media, backdrop: back ? { path: stored[back.nodeId], w: back.w, h: back.h, kind: back.kind, nodeId: back.nodeId } : undefined, original: stored['slide:' + frame.id] };
    });
    const prev = prevCh.get(c.id);
    const cover = blocks[0]?.kind === 'cover' ? blocks[0] : undefined;
    return {
      id: c.id, key,
      title: prev?.edited ? prev.title : (cover?.heading?.replace(/\n/g, ' ') || title),
      kicker: prev?.edited ? prev.kicker : (key ? CHAPTER_NAMES[key] || '' : ''),
      lede: prev?.edited ? prev.lede : '',
      hidden: prev?.hidden, removed: prev?.removed, edited: prev?.edited, thumb: prev?.thumb, thumbSample: prev?.thumbSample, thumbWords: prev?.thumbWords,
      blocks: prev ? mergeBlocks(blocks, prev.blocks) : blocks,
      rules: rulesFor(key)
    };
  });
  for (const key of Object.keys(CHAPTER_NAMES)) {
    if (usedKeys.has(key)) continue;
    const rules = rulesFor(key);
    const prev = prevCh.get(`rules-${key}`);
    if (rules.length) chapters.push({ id: `rules-${key}`, key, title: prev?.title || CHAPTER_NAMES[key], kicker: 'Rules', lede: prev?.lede || '', hidden: prev?.hidden, edited: prev?.edited, blocks: prev?.blocks || [], rules });
  }
  // Chapters the studio added by hand, and chapters drafted for the tier, survive a rebuild
  for (const c of previous?.chapters || []) if (c.id.startsWith('custom-') || c.id.startsWith('draft-')) chapters.push(c);

  const colourCh = chapters.filter((c) => c.key === 'colour');
  const colourFrames = scan.chapters.filter((c) => keyFor(clean(c.title)) === 'colour').flatMap((c) => c.frames);
  const guide: Guide = { version: GUIDE_VERSION, generatedAt: new Date().toISOString(), file: scan.fileName, page: scan.pageName, chapters, colours: readColours(colourCh.flatMap((c) => c.blocks), colourFrames.length ? colourFrames : scan.chapters.flatMap((c) => c.frames)) };

  const brand = (p.brand || {}) as { core?: { name: string; hex: string; note?: string }[] };
  const update: Record<string, unknown> = { content: { ...content, guide } };
  if (!brand.core?.length && guide.colours.length) update.brand = { ...brand, core: guide.colours.map((c) => ({ name: c.name, hex: c.hex, note: c.role })) };
  const { error: ue } = await sb.from('projects').update(update).eq('id', projectId);
  if (ue) throw ue;

  // Tidy images from earlier builds that nothing uses any more (uploads by the studio are kept)
  if (previous) {
    const keep = new Set(guidePaths(guide));
    const old = guidePaths(previous).filter((x) => !keep.has(x) && !x.includes('/guide/uploads/'));
    for (let i = 0; i < old.length; i += 100) await sb.storage.from('previews').remove(old.slice(i, i + 100));
  }
  return guide;
}

/** Every stored image a guide refers to. */
export function guidePaths(g: Guide) {
  return g.chapters.flatMap((c) => [c.thumb, ...c.blocks.flatMap((b) => [b.original, b.backdrop?.path, ...(b.media || []).map((m) => m.path), ...(b.items || []).map((i) => i.media?.path)])]).filter(Boolean) as string[];
}

/** Plain text of a chapter, for the brand chat and the connector. */
export function chapterText(c: GuideChapter) {
  return c.blocks.filter((b) => !b.hidden && !b.draft).flatMap(blockText);
}
