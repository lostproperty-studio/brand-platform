import { blockPaths } from '@/lib/figma/blocks';
import type { TextStyle } from '@/lib/figma/blocks';
import { adminClient } from '@/lib/supabase/server';
import { exportNodes, fetchPage, scanFigmaPage, type ScanFrame } from '@/lib/figma/scan';
import { blockText, frameToBlock, furnitureText, furnitureVisuals, type Block, type BlockMedia, type FNode, type Visual } from '@/lib/figma/blocks';
import { resolvedText } from '@/lib/kit/fromProject';
import { readSources, resolvePage } from '@/lib/figma/sources';
import { buildGuideFromTemplate } from '@/lib/portal/templateBuild';

// The client-facing guidelines, rebuilt from the Figma page as responsive web content.
// Each row of frames is a chapter; each frame becomes a block (heading, text, images, swatches, layout).
// The studio edits blocks afterwards. On a rebuild, edited and added blocks are kept; untouched ones refresh from Figma.

export type { Block, BlockKind, BlockMedia } from '@/lib/figma/blocks';
export type GuideRule = { title: string; text: string };
export type GuideChapter = { id: string; key: string | null; title: string; kicker: string; lede: string; hidden?: boolean; edited?: boolean; blocks: Block[]; rules: GuideRule[]; /** Added to fill a gap for the tier */ slot?: string;
  /** Deleted by the studio: kept out of the guide, and stays deleted when rebuilt from Figma */ removed?: boolean;
  /** Home page cover: an uploaded thumbnail, the type sample, and the tone-of-voice words */ thumb?: string; thumbSample?: string; thumbWords?: string;
  /** When the chapter was last brought in from Figma */ importedAt?: string;
  /** Styling for the chapter's label, title and introduction, set in the editor */ styles?: Record<string, TextStyle> };
export type GuideColour = { name: string; hex: string; role: string };
export type Guide = { version?: number; generatedAt: string; file: string; page: string; chapters: GuideChapter[]; colours: GuideColour[];
  /** The guide's text styles and spacing, as set in the Styles window (otherwise generated from the guidelines) */ system?: import('@/lib/guideSystem').GuideSystem;
  /** The icon library used in the editor: an Iconify set prefix (lucide by default) */ icons?: { set: string } };
export const GUIDE_VERSION = 3;

const KEYS: [RegExp, string][] = [
  [/logo|wordmark|marque|symbol|lock-?up|identity/i, 'logo'], [/typo|type|font/i, 'type'], [/colou?r|palette/i, 'colour'],
  [/grid|layout|composition|spacing/i, 'layout'], [/imag|photo|art direction|illustrat|pattern|graphic/i, 'imagery'],
  [/voice|tone|copy|writing|messag|verbal/i, 'voice'], [/icon/i, 'icons'], [/applicat|example|in use|touchpoint/i, 'applications']
];
export const CHAPTER_NAMES: Record<string, string> = { logo: 'Logo', type: 'Typography', colour: 'Colour', layout: 'Grid & layout', imagery: 'Imagery', voice: 'Tone of voice' };
export const keyFor = (title: string) => KEYS.find(([re]) => re.test(title))?.[1] ?? null;
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
export function mergeBlocks(fresh: Block[], prev: Block[]): Block[] {
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
/** How a rebuild treats the studio's work: update refreshes from Figma and keeps edits; add keeps everything as it
 *  is and only brings in chapters, sections and assets that are new in Figma; fresh starts over from the file. */
export type BuildMode = 'update' | 'add' | 'fresh';

/** Keeps the previous guidelines as they are and adds only what's new in the fresh build, each in its place. */
export function addNewOnly(prev: Guide, next: Guide): Guide {
  const after = <T extends { id: string }>(list: T[], fresh: T[], x: T) => { const i = fresh.indexOf(x); const before = fresh.slice(0, i).reverse().find((y) => list.some((o) => o.id === y.id)); return before ? list.findIndex((o) => o.id === before.id) + 1 : 0; };
  const chapters = prev.chapters.map((c) => {
    const n = next.chapters.find((x) => x.id === c.id); if (!n) return c;
    const out = [...c.blocks];
    for (const b of n.blocks) if (!out.some((o) => o.id === b.id)) out.splice(after(out, n.blocks, b), 0, b);
    return out.length === c.blocks.length ? c : { ...c, blocks: out };
  });
  for (const n of next.chapters) if (!chapters.some((c) => c.id === n.id)) chapters.splice(after(chapters, next.chapters, n), 0, n);
  const hexes = new Set(prev.colours.map((c) => c.hex.toUpperCase()));
  return { ...prev, generatedAt: next.generatedAt, file: next.file, page: next.page, version: next.version, chapters, colours: [...prev.colours, ...next.colours.filter((c) => !hexes.has(c.hex.toUpperCase()))] };
}

/** What a build brings in: the guidelines (all chapters or chosen ones, and the showcase), or the brand assets */
export type BuildOpts = { part?: 'guidelines' | 'assets'; chapters?: string[]; showcase?: boolean; wipe?: boolean };

export async function buildGuide(projectId: string, mode: BuildMode = 'update', opts: BuildOpts = {}) {
  const sb = adminClient();
  const { data: p, error } = await sb.from('projects').select('figma_key, figma_page_id, content, brand').eq('id', projectId).single();
  if (error) throw error;
  const sources = readSources(p.content, p);
  const part = opts.part || 'guidelines';
  const src = part === 'assets' ? sources.assets || sources.guidelines : sources.guidelines;
  if (!src) throw new Error(part === 'assets' ? 'Add the Figma link for the brand assets first.' : 'Add the Figma link for the guidelines first.');
  const where = await resolvePage(src.key, src.page, part);
  const markImported = async () => { const { data: cur } = await sb.from('projects').select('content').eq('id', projectId).single(); const ss = readSources(cur?.content, p); const k = part === 'assets' ? 'assets' : 'guidelines'; await sb.from('projects').update({ content: { ...((cur?.content as object) || {}), sources: { ...ss, [k]: { ...(ss[k] || src), file: where.file, pageName: where.pageName, importedAt: new Date().toISOString() } } } }).eq('id', projectId); };
  if (part === 'assets') {
    if (!where.page || !where.template) throw new Error('Couldn’t find an Assets page laid out like the studio template in that file. Link the template’s Assets page.');
    const g = await buildGuideFromTemplate(projectId, p as { content: unknown; brand: unknown }, { assets: where.page, guidelines: '', file: where.file }, mode, { wipe: opts.wipe }, src.key);
    await markImported(); return g;
  }
  // A file made from the studio's guidelines template is read by its layer names, not interpreted
  if (where.template && where.page) {
    const g = await buildGuideFromTemplate(projectId, p as { content: unknown; brand: unknown }, { assets: '', guidelines: where.page, file: where.file }, mode, { chapters: opts.chapters, showcase: opts.showcase }, src.key);
    await markImported(); return g;
  }
  p.figma_key = src.key; p.figma_page_id = src.page;
  const fetched = await fetchPage(p.figma_key, p.figma_page_id);
  const scan = await scanFigmaPage(p.figma_key, p.figma_page_id, fetched);
  const nodeById = new Map<string, FNode>(((fetched.root as unknown as FNode).children || []).map((n) => [n.id, n]));
  const slides = scan.chapters.flatMap((c) => c.frames.map((f) => nodeById.get(f.id)).filter(Boolean) as FNode[]);
  const furniture = furnitureText(slides);
  const furnitureVis = furnitureVisuals(slides);
  // Only the chapters asked for are built; the others stay as they are
  if (opts.chapters) scan.chapters = scan.chapters.filter((c) => opts.chapters!.includes(c.id));

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
  // Starting over: the studio's earlier work isn't merged in
  const prevCh = new Map((mode === 'fresh' ? [] : previous?.chapters || []).map((c) => [c.id, c]));
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
  for (const c of mode === 'fresh' ? [] : previous?.chapters || []) if (c.id.startsWith('custom-') || c.id.startsWith('draft-')) chapters.push(c);

  if (opts.chapters && previous) {
    const now = new Date().toISOString();
    const builtNow = chapters.filter((c) => opts.chapters!.includes(c.id)).map((c) => ({ ...c, importedAt: now }));
    const merged = previous.chapters.map((c) => builtNow.find((b) => b.id === c.id) || c);
    for (const b of builtNow) if (!merged.some((c) => c.id === b.id)) merged.push(b);
    chapters.splice(0, chapters.length, ...merged);
  }
  const colourCh = chapters.filter((c) => c.key === 'colour');
  const colourFrames = scan.chapters.filter((c) => keyFor(clean(c.title)) === 'colour').flatMap((c) => c.frames);
  const built: Guide = { version: GUIDE_VERSION, generatedAt: new Date().toISOString(), file: scan.fileName, page: scan.pageName, chapters, colours: readColours(colourCh.flatMap((c) => c.blocks), colourFrames.length ? colourFrames : scan.chapters.flatMap((c) => c.frames)) };
  if (opts.chapters && previous && !built.colours.length) built.colours = previous.colours;
  const guide = mode === 'add' && previous ? addNewOnly(previous, built) : built;

  const brand = (p.brand || {}) as { core?: { name: string; hex: string; note?: string }[] };
  const update: Record<string, unknown> = { content: { ...content, guide, ...(mode === 'fresh' ? { dismissedSlots: [] } : {}) } };
  if ((mode === 'fresh' || !brand.core?.length) && guide.colours.length) update.brand = { ...brand, core: guide.colours.map((c) => ({ name: c.name, hex: c.hex, note: c.role })) };
  const { error: ue } = await sb.from('projects').update(update).eq('id', projectId);
  if (ue) throw ue;
  await markImported();

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
  return g.chapters.flatMap((c) => [c.thumb, ...c.blocks.flatMap((b) => [b.original, ...blockPaths(b)])]).filter(Boolean) as string[];
}

/** Plain text of a chapter, for the brand chat and the connector. */
export function chapterText(c: GuideChapter) {
  return c.blocks.filter((b) => !b.hidden && !b.draft).flatMap(blockText);
}
