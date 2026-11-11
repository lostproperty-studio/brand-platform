import { randomUUID } from 'node:crypto';
import { adminClient } from '@/lib/supabase/server';
import { exportNodes } from '@/lib/figma/scan';
import { readSources, resolvePage } from '@/lib/figma/sources';
import { frameToTemplateBlock, readTemplate } from '@/lib/figma/template';
import type { Block, BlockMedia } from '@/lib/portal/guide';

// The layouts in a project's Figma guidelines, to add one as a new section anywhere in the guide. Only files made
// from the studio's template: their frames are named for the layout they are, so each converts to a section as-is.

type Node = { id: string; name: string; children?: Node[] };
export type FigmaLayout = { id: string; name: string; chapter: string; thumb?: string };

async function template(projectId: string) {
  const sb = adminClient();
  const { data: p, error } = await sb.from('projects').select('figma_key, figma_page_id, content').eq('id', projectId).single();
  if (error) throw error;
  const src = readSources(p.content, p).guidelines;
  if (!src) throw new Error('Add the Figma link for the guidelines first, in Project settings.');
  const where = await resolvePage(src.key, src.page, 'guidelines');
  if (!where.template || !where.page) throw new Error('Adding sections from Figma works with files made from the studio’s guidelines template.');
  const t = await readTemplate(src.key, { assets: '', guidelines: where.page });
  return { key: src.key, file: where.file, t };
}
const ids = (n: Node, out = new Set<string>()) => { out.add(n.id); for (const c of n.children || []) ids(c, out); return out; };
/** Is this frame one the template knows how to make into a section? */
const usable = (f: Node) => { try { return !!frameToTemplateBlock(f as never, () => undefined); } catch { return false; } };

/** Every layout frame in the guidelines, by chapter, with a small preview */
export async function listFigmaLayouts(projectId: string): Promise<{ file: string; layouts: FigmaLayout[] }> {
  const { key, file, t } = await template(projectId);
  const layouts: FigmaLayout[] = [];
  for (const c of t.chapters) for (const f of c.frames as unknown as Node[]) if (usable(f)) layouts.push({ id: f.id, name: f.name.split('·')[0].trim() || f.name, chapter: c.title });
  const list = layouts.slice(0, 120);
  // Previews straight from Figma: small, and they expire, which is fine for a picker
  const thumbs = list.length ? await exportNodes(key, list.map((l) => l.id), 'png', 0.35).catch(() => ({} as Record<string, string | null>)) : {};
  return { file, layouts: list.map((l) => ({ ...l, thumb: thumbs[l.id] || undefined })) };
}

/** One frame, made into a section: its pictures exported and stored, a fresh id so it sits alongside anything else */
export async function importFigmaLayout(projectId: string, frameId: string): Promise<{ block: Block; urls: Record<string, string> }> {
  const { key, t } = await template(projectId);
  const frame = t.chapters.flatMap((c) => c.frames as unknown as Node[]).find((f) => f.id === frameId);
  if (!frame) throw new Error('That layout isn’t in the Figma file any more. Refresh the list and try again.');
  const inside = ids(frame);
  const imgs = t.imageNodes.filter((id) => inside.has(id));
  const vec = new Set((t.vectorNodes || []).filter((id) => inside.has(id)));
  const pngIds = imgs.filter((id) => !vec.has(id)), svgIds = [...vec];
  const [png, svg] = await Promise.all([pngIds.length ? exportNodes(key, pngIds, 'png', 2) : {}, svgIds.length ? exportNodes(key, svgIds, 'svg') : {}]);
  const sb = adminClient();
  const stamp = Date.now().toString(36);
  const safe = (id: string) => id.replace(/[^a-z0-9]+/gi, '-');
  const jobs = [...Object.entries(png as Record<string, string | null>).map(([id, url]) => ({ id, url, ext: 'png', type: 'image/png' })), ...Object.entries(svg as Record<string, string | null>).map(([id, url]) => ({ id, url, ext: 'svg', type: 'image/svg+xml' }))].filter((j) => j.url);
  const stored: Record<string, string> = {};
  await Promise.all(jobs.map(async (j) => {
    try {
      const res = await fetch(j.url!); if (!res.ok) return;
      const bytes = new Uint8Array(await res.arrayBuffer()); if (!bytes.byteLength) return;
      const path = `${projectId}/guide/${stamp}/${safe(j.id)}.${j.ext}`;
      const { error } = await sb.storage.from('previews').upload(path, bytes, { contentType: j.type, upsert: true, cacheControl: '60' });
      if (!error) stored[j.id] = path;
    } catch { /* a picture that fails to export is left as an empty frame */ }
  }));
  const media = (id: string): BlockMedia | undefined => stored[id] ? { path: stored[id], w: t.sizes[id]?.w || 1200, h: t.sizes[id]?.h || 800, kind: vec.has(id) ? 'graphic' : 'photo', nodeId: id } : undefined;
  const made = frameToTemplateBlock(frame as never, media);
  if (!made) throw new Error('That frame isn’t named for a layout, so it can’t be made into a section.');
  // A new section of the studio's: kept as it is on a rebuild, never mistaken for the frame's own copy
  const block = { ...made, id: 'b-' + randomUUID().slice(0, 8), edited: true } as Block;
  const paths = Object.values(stored);
  const urls: Record<string, string> = {};
  if (paths.length) {
    const { data } = await sb.storage.from('previews').createSignedUrls(paths, 6 * 3600);
    for (const d of data || []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
  }
  return { block, urls };
}
