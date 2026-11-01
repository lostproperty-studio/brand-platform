import { adminClient } from '@/lib/supabase/server';
import { exportNodes } from '@/lib/figma/scan';
import { frameToTemplateBlock, readTemplate, type TemplatePages } from '@/lib/figma/template';
import { CHAPTER_NAMES, GUIDE_VERSION, guidePaths, keyFor, mergeBlocks, normaliseGuide, type Block, type BlockMedia, type Guide, type GuideChapter } from '@/lib/portal/guide';
import { packageSettings, type PackageMap, type PkgFile } from '@/lib/portal/packages';
import { readShowcase, type ShowcaseRow } from '@/lib/showcase';

// Builds a project's first draft from a Figma file made from the studio's guidelines template:
// the guidelines (chapter by chapter, laid out as the frames are named), the palette, type roles, the asset
// packages, chapter thumbnails, the showcase, and the brand's line and welcome. Studio edits are kept:
// edited and added sections, chapter settings, uploaded files, and a showcase the studio has changed.

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
const safe = (id: string) => id.replace(/[:;]/g, '-');

export async function buildGuideFromTemplate(projectId: string, p: { figma_key: string; content: unknown; brand: unknown }, pages: TemplatePages & { file: string }) {
  const sb = adminClient();
  const t = await readTemplate(p.figma_key, pages);
  const content = (p.content || {}) as Record<string, unknown> & { guide?: Guide; homeIntro?: string };
  const brand = (p.brand || {}) as { core?: { name: string; hex: string; note?: string }[]; fonts?: { role: string; name?: string; label?: string; files?: unknown[] }[] };

  // 1. Export pictures (PNG) and artwork (SVG or PNG), then store them
  const pngIds = [...new Set([...t.imageNodes, ...t.chapters.map((c) => c.thumbNode).filter(Boolean) as string[], ...t.showcase.flatMap((r) => r.frames.map((f) => f.nodeId)), ...t.assets.filter((a) => a.format === 'png').map((a) => a.nodeId)])];
  const svgIds = t.assets.filter((a) => a.format === 'svg').map((a) => a.nodeId);
  const [png, svg] = await Promise.all([pngIds.length ? exportNodes(p.figma_key, pngIds, 'png', 2) : {}, svgIds.length ? exportNodes(p.figma_key, svgIds, 'svg') : {}]);
  const stamp = Date.now().toString(36);
  const assetById = new Map(t.assets.map((a) => [a.nodeId, a]));
  const showIds = new Set(t.showcase.flatMap((r) => r.frames.map((f) => f.nodeId)));
  type Job = { id: string; url: string; bucket: 'previews' | 'kits'; path: string; type: string };
  const jobs: Job[] = [];
  for (const [id, url] of Object.entries(png as Record<string, string | null>)) if (url) { const a = assetById.get(id); jobs.push(a ? { id, url, bucket: 'kits', path: `${projectId}/packages/${a.pkg}/figma-${slug(a.name)}.png`, type: 'image/png' } : { id, url, bucket: 'previews', path: showIds.has(id) ? `${projectId}/showcase/figma-${safe(id)}.png` : `${projectId}/guide/${stamp}/${safe(id)}.png`, type: 'image/png' }); }
  for (const [id, url] of Object.entries(svg as Record<string, string | null>)) if (url) { const a = assetById.get(id)!; jobs.push({ id, url, bucket: 'kits', path: `${projectId}/packages/${a.pkg}/figma-${slug(a.name)}.svg`, type: 'image/svg+xml' }); }
  const stored: Record<string, { path: string; bytes: number }> = {};
  const queue = [...jobs];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let j = queue.shift(); j; j = queue.shift()) {
      try {
        const bytes = new Uint8Array(await (await fetch(j.url)).arrayBuffer());
        const { error } = await sb.storage.from(j.bucket).upload(j.path, bytes, { contentType: j.type, upsert: true });
        if (!error) stored[j.id] = { path: j.path, bytes: bytes.byteLength };
      } catch { /* a failed export leaves that picture out */ }
    }
  }));
  const media = (id: string): BlockMedia | undefined => stored[id] && !assetById.has(id) ? { path: stored[id].path, w: t.sizes[id]?.w || 1200, h: t.sizes[id]?.h || 800, kind: 'photo', nodeId: id } : undefined;

  // 2. Chapters and their sections, merged with the studio's earlier work
  const previous = normaliseGuide(content.guide);
  const prevCh = new Map((previous?.chapters || []).map((c) => [c.id, c]));
  const chapters: GuideChapter[] = t.chapters.map((c) => {
    const id = 't-' + slug(c.title);
    const key = keyFor(c.title);
    const blocks = c.frames.map((f) => frameToTemplateBlock(f, media)).filter(Boolean) as Block[];
    const prev = prevCh.get(id);
    // A thumbnail uploaded in the platform wins over the template's
    const thumb = prev?.thumb?.includes('/guide/uploads/') ? prev.thumb : c.thumbNode && stored[c.thumbNode] ? stored[c.thumbNode].path : prev?.thumb;
    return {
      id, key, slot: undefined,
      title: prev?.edited ? prev.title : c.title,
      kicker: prev?.edited ? prev.kicker : (key ? CHAPTER_NAMES[key] || '' : ''),
      lede: prev?.edited ? prev.lede : c.intro || '',
      hidden: prev?.hidden, removed: prev?.removed, edited: prev?.edited,
      thumb, thumbSample: prev?.thumbSample, thumbWords: prev?.thumbWords,
      blocks: prev ? mergeBlocks(blocks, prev.blocks) : blocks,
      rules: []
    };
  });
  for (const c of previous?.chapters || []) if (c.id.startsWith('custom-') || c.id.startsWith('draft-')) chapters.push(c);
  const guide: Guide = { version: GUIDE_VERSION, generatedAt: new Date().toISOString(), file: pages.file, page: 'Guidelines (template)', chapters, colours: t.colours };

  // 3. Packages: files from the template replace the template's previous files; studio uploads stay
  const pkgs: PackageMap = { ...packageSettings(content) };
  const oldFigma: string[] = [];
  for (const s of Object.values(pkgs)) for (const f of s.files || []) if (f.fromFigma) oldFigma.push(f.path);
  const fresh = new Map<string, PkgFile[]>();
  for (const a of t.assets) {
    const st = stored[a.nodeId]; if (!st) continue;
    const ext = st.path.split('.').pop();
    const list = fresh.get(a.pkg) || []; list.push({ name: `${slug(a.name)}.${ext}`, path: st.path, bytes: st.bytes, type: ext === 'svg' ? 'image/svg+xml' : 'image/png', fromFigma: true }); fresh.set(a.pkg, list);
  }
  for (const key of new Set([...Object.keys(pkgs), ...fresh.keys()])) {
    const cur = pkgs[key] || {};
    const keep = (cur.files || []).filter((f) => !f.fromFigma);
    const add = fresh.get(key) || [];
    if (!add.length && !(cur.files || []).some((f) => f.fromFigma)) continue;
    const title = key.startsWith('custom-') ? cur.title || t.assets.find((a) => a.pkg === key)?.title : cur.title;
    pkgs[key] = { ...cur, ...(title ? { title } : {}), files: [...keep, ...add], ...(add.length ? { enabled: true } : {}) };
  }
  const nowUsed = new Set([...fresh.values()].flat().map((f) => f.path));
  const stale = oldFigma.filter((x) => !nowUsed.has(x));
  if (stale.length) await sb.storage.from('kits').remove(stale);

  // 4. Showcase: from the template until the studio changes it in the platform
  const sc = readShowcase(content);
  const studioEdited = sc.rows.some((r) => !r.fromFigma);
  const rows: ShowcaseRow[] = t.showcase.map((r, i) => ({ id: 'f-' + i + '-' + r.frames[0].nodeId.replace(/[^0-9a-z]/gi, ''), layout: r.layout, fromFigma: true, frames: r.frames.map((f) => (stored[f.nodeId] ? { kind: 'image' as const, path: stored[f.nodeId].path } : { kind: 'empty' as const })) }));
  const showcase = studioEdited || !rows.length ? content.showcase : { ...sc, rows };

  // 5. Brand basics: palette and type roles from the template; line and welcome only where not already set
  const update: Record<string, unknown> = {};
  const nextBrand: Record<string, unknown> = { ...brand };
  if (t.colours.length) nextBrand.core = t.colours.map((c) => ({ name: c.name, hex: c.hex, note: c.role }));
  if (t.fonts.length) {
    const fonts = [...(brand.fonts || [])];
    for (const f of t.fonts) { const i = fonts.findIndex((x) => x.role === f.role); if (i < 0) fonts.push({ role: f.role, name: f.family, label: f.use || '', files: [] }); else if (!fonts[i].name) fonts[i] = { ...fonts[i], name: f.family }; }
    nextBrand.fonts = fonts;
  }
  update.brand = nextBrand;
  update.content = { ...content, guide, packages: pkgs, showcase, ...(t.brand.intro && !content.homeIntro ? { homeIntro: t.brand.intro } : {}), typeScale: t.styles.length ? t.styles : (content as { typeScale?: unknown }).typeScale };
  const { data: proj } = await sb.from('projects').select('line').eq('id', projectId).single();
  if (t.brand.line && !proj?.line) update.line = t.brand.line;
  const { error } = await sb.from('projects').update(update).eq('id', projectId);
  if (error) throw error;

  // Tidy guide images from earlier builds that nothing uses any more
  if (previous) {
    const keep = new Set(guidePaths(guide));
    const old = guidePaths(previous).filter((x) => !keep.has(x) && !x.includes('/guide/uploads/'));
    for (let i = 0; i < old.length; i += 100) await sb.storage.from('previews').remove(old.slice(i, i + 100));
  }
  return guide;
}
