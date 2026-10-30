import { adminClient } from '@/lib/supabase/server';
import { exportNodes, scanFigmaPage, type FigmaScan, type ScanFrame } from '@/lib/figma/scan';
import { resolvedText } from '@/lib/kit/fromProject';

// The client-facing guidelines, generated from the Figma page: each row of frames becomes a chapter,
// each frame is shown as it was designed, and the review's measurable rules sit underneath.
// The studio can rename or hide chapters and frames afterwards; rebuilding keeps those edits.

export type GuideFrame = { nodeId: string; path: string; w: number; h: number; text: string[]; hidden?: boolean };
export type GuideRule = { title: string; text: string };
export type GuideChapter = { id: string; key: string | null; title: string; kicker: string; lede: string; hidden?: boolean; frames: GuideFrame[]; rules: GuideRule[] };
export type GuideColour = { name: string; hex: string; role: string };
export type Guide = { generatedAt: string; file: string; page: string; chapters: GuideChapter[]; colours: GuideColour[] };

const KEYS: [RegExp, string][] = [
  [/logo|wordmark|marque|symbol|lock-?up|identity/i, 'logo'], [/typo|type|font/i, 'type'], [/colou?r|palette/i, 'colour'],
  [/grid|layout|composition|spacing/i, 'layout'], [/imag|photo|art direction|illustrat|pattern|graphic/i, 'imagery'],
  [/voice|tone|copy|writing|messag|verbal/i, 'voice'], [/icon/i, 'icons'], [/applicat|example|in use|touchpoint/i, 'applications']
];
const CHAPTER_NAMES: Record<string, string> = { logo: 'Logo', type: 'Typography', colour: 'Colour', layout: 'Grid & layout', imagery: 'Imagery', voice: 'Tone of voice' };
const keyFor = (title: string) => KEYS.find(([re]) => re.test(title))?.[1] ?? null;
const clean = (t: string) => t.replace(/^\s*(chapter\s*)?\d{1,2}[.)\s:–-]*/i, '').replace(/\s+/g, ' ').trim();
const HEX = /#?\b([0-9A-F]{6})\b/i;

/** Colour names and values, read from text like "Tileyard Black  #1A1A1A" in the colour chapter. */
export function readColours(frames: ScanFrame[]): GuideColour[] {
  const out = new Map<string, GuideColour>();
  for (const f of frames) {
    const lines = f.texts.map((t) => t.text);
    lines.forEach((line, i) => {
      for (const m of line.matchAll(new RegExp(HEX.source, 'gi'))) {
        const hex = '#' + m[1].toUpperCase();
        if (out.has(hex)) continue;
        const own = line.replace(new RegExp(HEX.source, 'gi'), '').replace(/\b(hex|rgb|cmyk|pms|pantone|ral)\b.*$/i, '').replace(/[:·|,/]+/g, ' ').trim();
        let name = /[a-z]{3,}/i.test(own) && own.length < 40 ? own : '';
        for (let k = i - 1; !name && k >= Math.max(0, i - 3); k--) {
          const prev = lines[k];
          if (/[a-z]{3,}/i.test(prev) && !HEX.test(prev) && !/\b(rgb|cmyk|pms|pantone|ral)\b/i.test(prev) && prev.length < 40) name = prev;
        }
        out.set(hex, { name: name || hex, hex, role: '' });
      }
    });
  }
  if (out.size) return [...out.values()].slice(0, 16);
  // No hex codes written in the file: use the largest solid fills in those frames
  const area = new Map<string, number>();
  for (const f of frames) for (const x of f.fills) area.set(x.hex, (area.get(x.hex) || 0) + x.area);
  return [...area.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([hex]) => ({ name: hex, hex, role: '' }));
}

type Item = Parameters<typeof resolvedText>[0];

export function guideFromScan(scan: FigmaScan, items: Item[], paths: Record<string, { path: string; w: number; h: number }>, previous?: Guide | null): Guide {
  const prevCh = new Map((previous?.chapters || []).map((c) => [c.id, c]));
  const used = new Set<string>();
  const rulesFor = (key: string | null) => {
    if (!key || used.has(key)) return [];
    used.add(key);
    return items.filter((i) => i.chapter === key && i.kind !== 'asset' && i.kind !== 'issue').map((i) => ({ title: i.title, text: resolvedText(i) })).filter((r) => r.text);
  };
  const chapters: GuideChapter[] = scan.chapters.map((c) => {
    const divider = c.frames[0];
    const title = clean(c.title) || 'Untitled';
    const key = keyFor(title);
    const byLength = divider.texts.map((t) => t.text).filter((t) => !title.includes(t) && !c.title.includes(t)).sort((a, b) => b.length - a.length);
    const prev = prevCh.get(c.id);
    const prevFrames = new Map((prev?.frames || []).map((f) => [f.nodeId, f]));
    return {
      id: c.id, key,
      title: prev?.title ?? title,
      kicker: prev?.kicker ?? (key ? CHAPTER_NAMES[key] || '' : ''),
      lede: prev?.lede ?? (byLength.find((t) => t.length > 60) || ''),
      hidden: prev?.hidden,
      frames: c.frames.filter((f) => paths[f.id]).map((f) => ({ nodeId: f.id, ...paths[f.id], text: f.texts.map((t) => t.text), hidden: prevFrames.get(f.id)?.hidden })),
      rules: rulesFor(key)
    };
  });
  // Rules for topics the Figma page has no chapter for (e.g. tone of voice) get a text-only chapter
  for (const key of Object.keys(CHAPTER_NAMES)) {
    if (used.has(key)) continue;
    const rules = rulesFor(key);
    if (rules.length) chapters.push({ id: `rules-${key}`, key, title: CHAPTER_NAMES[key], kicker: 'Rules', lede: '', hidden: prevCh.get(`rules-${key}`)?.hidden, frames: [], rules });
  }
  const colourFrames = scan.chapters.filter((c) => keyFor(clean(c.title)) === 'colour').flatMap((c) => c.frames);
  return { generatedAt: new Date().toISOString(), file: scan.fileName, page: scan.pageName, chapters, colours: readColours(colourFrames.length ? colourFrames : scan.chapters.flatMap((c) => c.frames)) };
}

/** Reads the Figma page again, exports every frame, and stores the guide on the project. */
export async function buildGuide(projectId: string) {
  const sb = adminClient();
  const { data: p, error } = await sb.from('projects').select('figma_key, figma_page_id, content, brand').eq('id', projectId).single();
  if (error) throw error;
  if (!p.figma_key) throw new Error('Link a Figma file first.');
  const scan = await scanFigmaPage(p.figma_key, p.figma_page_id);
  const frames = scan.chapters.flatMap((c) => c.frames);
  const urls = await exportNodes(p.figma_key, frames.map((f) => f.id), 'jpg', 2);
  const paths: Record<string, { path: string; w: number; h: number }> = {};
  const queue = frames.filter((f) => urls[f.id]);
  const stamp = Date.now().toString(36);
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const bytes = new Uint8Array(await (await fetch(urls[f.id]!)).arrayBuffer());
      const path = `${projectId}/guide/${stamp}/${f.id.replace(/[:;]/g, '-')}.jpg`;
      const { error: e } = await sb.storage.from('previews').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (!e) paths[f.id] = { path, w: Math.round(f.w), h: Math.round(f.h) };
    }
  }));
  const { data: lastScan } = await sb.from('scans').select('id').eq('project_id', projectId).eq('status', 'done').order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { data: items } = lastScan ? await sb.from('review_items').select('chapter, kind, title, proposal, answer, recommend, status, input, node_id').eq('scan_id', lastScan.id).order('ord') : { data: [] };
  const content = (p.content || {}) as { guide?: Guide };
  const previous = content.guide;
  const guide = guideFromScan(scan, (items || []) as Item[], paths, previous);
  const brand = (p.brand || {}) as { core?: { name: string; hex: string; note?: string }[] };
  const update: Record<string, unknown> = { content: { ...content, guide } };
  if (!brand.core?.length && guide.colours.length) update.brand = { ...brand, core: guide.colours.map((c) => ({ name: c.name, hex: c.hex, note: c.role })) };
  await sb.from('projects').update(update).eq('id', projectId);
  // Remove frame images from earlier builds
  if (previous) {
    const old = previous.chapters.flatMap((c) => c.frames.map((f) => f.path)).filter((x) => !x.includes(`/guide/${stamp}/`));
    for (let i = 0; i < old.length; i += 100) await sb.storage.from('previews').remove(old.slice(i, i + 100));
  }
  return guide;
}
