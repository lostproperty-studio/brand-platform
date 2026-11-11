import { createHash } from 'crypto';
import { adminClient } from '@/lib/supabase/server';
import { pickLogo } from '@/lib/portal/logo';
import { exportNodes } from '@/lib/figma/scan';
import { frameToTemplateBlock, readTemplate, type TemplatePages } from '@/lib/figma/template';
import { addNewOnly, CHAPTER_NAMES, GUIDE_VERSION, type BuildMode, guidePaths, keyFor, mergeBlocks, normaliseGuide, type Block, type BlockMedia, type Guide, type GuideChapter } from '@/lib/portal/guide';
import { packageSettings, type PackageMap, type PkgFile } from '@/lib/portal/packages';
import { lines } from '@/lib/brandForm';
import { TIERS } from '@/lib/playbook';
import { readShowcase, type ShowcaseRow } from '@/lib/showcase';

// Builds a project's first draft from a Figma file made from the studio's guidelines template:
// the guidelines (chapter by chapter, laid out as the frames are named), the palette, type roles, the asset
// packages, chapter thumbnails, the showcase, and the brand's line and welcome. Studio edits are kept:
// edited and added sections, chapter settings, uploaded files, and a showcase the studio has changed.

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
const safe = (id: string) => id.replace(/[:;]/g, '-');
/** A file name from a layer name, keeping its case and underscores: "Tileyard_Wordmark_Dark", "wordmark / black" → "wordmark-black" */
export const fileName = (s: string) => s.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s*\/\s*/g, '-').replace(/\s+/g, '-').replace(/[^A-Za-z0-9_.-]/g, '').replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'asset';

/** What to bring in: the assets page, the guidelines page (all chapters, or only some), and the showcase */
export type TemplateOpts = { chapters?: string[]; showcase?: boolean; /** Starting over on assets: also remove files uploaded to the asset packages in the platform */ wipe?: boolean };

/** What an assets import changed, shown to the studio afterwards */
export type AssetsReport = {
  at: string; mode: BuildMode; file: string; wiped: boolean;
  /** Items on the Assets page that weren't taken, or were taken with a caveat */
  notes?: { pkg: string; name: string; reason: string }[];
  /** The kit repository update that followed, if any */
  kit?: { repo: string; files: number; removed: number; commit?: string; error?: string } | null;
  packages: { key: string; title: string; added: string[]; updated: string[]; removed: string[]; unchanged: number; uploads: number; uploadsRemoved: string[] }[];
  failed: string[];
  colours: { total: number; added: string[]; removed: string[] };
  fonts: { role: string; family: string; files: number; note?: string }[];
  logo: { name: string; light?: string } | null;
  form: number; line?: string;
};
const PKG_TITLE: Record<string, string> = { logos: 'Logos', avatars: 'Social avatars', icons: 'Icons', images: 'Images', graphics: 'Graphic language', fonts: 'Fonts' };
export const templateChapterId = (title: string) => 't-' + slug(title);

export async function buildGuideFromTemplate(projectId: string, p: { figma_key?: string | null; content: unknown; brand: unknown }, pages: TemplatePages & { file: string }, mode: BuildMode = 'update', opts: TemplateOpts = {}, fileKey?: string) {
  const sb = adminClient();
  const key = fileKey || p.figma_key!;
  const doAssets = !!pages.assets, doGuide = !!pages.guidelines;
  const t = await readTemplate(key, pages);
  // Nothing recognised on the Assets page: stop before anything is removed, and say what was seen
  if (doAssets && !t.assets.length) {
    const seen = t.assetSkips.slice(0, 4).map((x) => `${x.name} (${x.reason})`).join('; ');
    throw new Error(`No artwork found on the Assets page of “${pages.file}”, so nothing was changed. Assets go in sections named Logos, Avatars, Icons, Images or Graphic language, one frame per file with the artwork inside.${seen ? ' Seen: ' + seen + '.' : ''}`);
  }
  const pick = (id: string) => !opts.chapters || opts.chapters.includes(id);
  // Only the chapters asked for are read and exported
  t.chapters = t.chapters.filter((c) => pick(templateChapterId(c.title)));
  if (doGuide && opts.showcase === false) t.showcase = [];
  const raw = (p.content || {}) as Record<string, unknown> & { guide?: Guide; homeIntro?: string };
  // Starting over: what's being imported is rebuilt from the file as if new; everything else stays
  const content = mode === 'fresh' ? { ...raw, ...(doAssets ? { form: undefined, homeIntro: undefined } : {}), ...(doGuide && !opts.chapters ? { guide: undefined, dismissedSlots: [] } : {}), ...(doGuide && opts.showcase !== false ? { showcase: undefined } : {}) } : raw;
  const brand = (p.brand || {}) as { core?: { name: string; hex: string; note?: string }[]; fonts?: { role: string; name?: string; label?: string; files?: unknown[] }[] };

  // 1. Export pictures (PNG) and artwork (SVG or PNG), then store them
  // Pictures only for the chapters being imported
  const inChosen = new Set<string>(); const walkIds = (n: { id: string; children?: unknown[] }) => { inChosen.add(n.id); for (const c of (n.children || []) as { id: string; children?: unknown[] }[]) walkIds(c); };
  t.chapters.forEach((c) => c.frames.forEach((f) => walkIds(f as { id: string; children?: unknown[] })));
  t.imageNodes = t.imageNodes.filter((id) => inChosen.has(id));
  const pngIds = [...new Set([...t.imageNodes.filter((id) => !vec.has(id)), ...t.chapters.map((c) => c.thumbNode).filter(Boolean) as string[], ...t.showcase.flatMap((r) => r.frames.map((f) => f.nodeId)), ...t.assets.map((a) => a.nodeId)])];
  // Artwork in picture slots with no photo in it (logos, type, shapes) goes out as SVG so it stays crisp; text is outlined
  const vec = new Set((t.vectorNodes || []).filter((id) => t.imageNodes.includes(id)));
  const svgIds = [...t.assets.filter((a) => a.format === 'svg').map((a) => a.nodeId), ...vec];
  const [png, svg] = await Promise.all([pngIds.length ? exportNodes(key, pngIds, 'png', 2) : {}, svgIds.length ? exportNodes(key, svgIds, 'svg') : {}]);
  const stamp = Date.now().toString(36);
  const assetById = new Map(t.assets.map((a) => [a.nodeId, a]));
  const showIds = new Set(t.showcase.flatMap((r) => r.frames.map((f) => f.nodeId)));
  // Asset files get their content hash in the path, so a changed logo is a new file and never a stale cached copy
  type Job = { id: string; url: string; bucket: 'previews' | 'kits'; path: string; type: string; ext?: string };
  const jobs: Job[] = [];
  for (const [id, url] of Object.entries(png as Record<string, string | null>)) if (url) { const a = assetById.get(id); jobs.push(a ? { id: id + '|png', url, bucket: 'kits', path: `${projectId}/packages/${a.pkg}/figma-${slug(a.name)}`, type: 'image/png', ext: 'png' } : { id, url, bucket: 'previews', path: showIds.has(id) ? `${projectId}/showcase/figma-${safe(id)}.png` : `${projectId}/guide/${stamp}/${safe(id)}.png`, type: 'image/png' }); }
  for (const [id, url] of Object.entries(svg as Record<string, string | null>)) if (url) { const a = assetById.get(id); if (!a) { jobs.push({ id, url, bucket: 'previews', path: `${projectId}/guide/${stamp}/${safe(id)}.svg`, type: 'image/svg+xml' }); continue; } jobs.push({ id: id + '|svg', url, bucket: 'kits', path: `${projectId}/packages/${a.pkg}/figma-${slug(a.name)}`, type: 'image/svg+xml', ext: 'svg' }); }
  const stored: Record<string, { path: string; bytes: number; hash: string }> = {};
  const queue = [...jobs];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let j = queue.shift(); j; j = queue.shift()) {
      try {
        const res = await fetch(j.url); if (!res.ok) continue;
        const bytes = new Uint8Array(await res.arrayBuffer()); if (!bytes.byteLength) continue;
        const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 16);
        const path = j.ext ? `${j.path}-${hash.slice(0, 8)}.${j.ext}` : j.path;
        const { error } = await sb.storage.from(j.bucket).upload(path, bytes, { contentType: j.type, upsert: true, cacheControl: '60' });
        if (!error) stored[j.id] = { path, bytes: bytes.byteLength, hash };
      } catch { /* a failed export leaves that picture out */ }
    }
  }));
  const media = (id: string): BlockMedia | undefined => stored[id] && !assetById.has(id) ? { path: stored[id].path, w: t.sizes[id]?.w || 1200, h: t.sizes[id]?.h || 800, kind: vec.has(id) ? 'graphic' : 'photo', nodeId: id } : undefined;

  // 2. Chapters and their sections, merged with the studio's earlier work
  const previous = normaliseGuide(content.guide);
  // Starting over on some chapters: those chapters lose their earlier edits; the rest are kept as they are
  const prevCh = new Map((previous?.chapters || []).filter((c) => !(mode === 'fresh' && opts.chapters?.includes(c.id))).map((c) => [c.id, c]));
  const now = new Date().toISOString();
  const builtChapters: GuideChapter[] = t.chapters.map((c) => {
    const id = templateChapterId(c.title);
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
      thumb, thumbSample: prev?.thumbSample, thumbWords: prev?.thumbWords || (key === 'voice' && t.form['voice words'] ? lines(t.form['voice words']).slice(0, 3).join(', ') : undefined),
      blocks: prev ? mergeBlocks(blocks, prev.blocks) : blocks,
      rules: [], importedAt: now
    } as GuideChapter;
  });
  // The guide: imported chapters in place (new ones where the file puts them), everything else untouched
  let chapters: GuideChapter[];
  if (!doGuide) chapters = previous?.chapters || [];
  else if (opts.chapters && previous) {
    chapters = previous.chapters.map((c) => builtChapters.find((b) => b.id === c.id) || c);
    for (const b of builtChapters) if (!chapters.some((c) => c.id === b.id)) chapters.splice(chapters.filter((c) => !c.id.startsWith('custom-') && !c.id.startsWith('draft-')).length, 0, b);
  } else {
    chapters = [...builtChapters];
    for (const c of previous?.chapters || []) if (c.id.startsWith('custom-') || c.id.startsWith('draft-') || (opts.chapters && !chapters.some((x) => x.id === c.id))) chapters.push(c);
  }
  const colours = t.colours.length ? t.colours : previous?.colours || [];
  const built: Guide = { version: GUIDE_VERSION, generatedAt: now, file: doGuide ? pages.file : previous?.file || pages.file, page: doGuide ? 'Guidelines (template)' : previous?.page || 'Guidelines', chapters, colours };
  const guide = mode === 'add' && previous && doGuide ? addNewOnly(previous, built) : built;

  // 3. Packages. Update: files from Figma are matched to the last import, so new ones are added, changed ones
  // replaced and ones no longer in Figma removed; files uploaded in the platform stay. Add: only new files come in.
  // Start over: every file from the last import goes (and, if asked, the uploads too) and the packages are rebuilt.
  const pkgs: PackageMap = { ...packageSettings(raw) };
  const oldFigma: string[] = [];
  for (const s of Object.values(pkgs)) for (const f of s.files || []) if (f.fromFigma) oldFigma.push(f.path);
  const fresh = new Map<string, PkgFile[]>();
  // Vector artwork comes as SVG plus a 2× PNG; pictures as PNG. Files keep the layer's name as written (Tileyard_Wordmark_Dark.svg).
  for (const a of t.assets) {
    for (const ext of a.format === 'svg' ? ['svg', 'png'] : ['png']) {
      const st = stored[a.nodeId + '|' + ext]; if (!st) continue;
      const list = fresh.get(a.pkg) || []; list.push({ name: `${fileName(a.name)}.${ext}`, path: st.path, bytes: st.bytes, hash: st.hash, type: ext === 'svg' ? 'image/svg+xml' : 'image/png', fromFigma: true }); fresh.set(a.pkg, list);
    }
  }
  const wipe = doAssets && mode === 'fresh' && !!opts.wipe;
  const report: AssetsReport = { at: now, mode, file: pages.file, wiped: wipe, notes: t.assetSkips, kit: null, packages: [], failed: doAssets ? t.assets.filter((a) => !stored[a.nodeId + '|svg'] && !stored[a.nodeId + '|png']).map((a) => a.name) : [], colours: { total: 0, added: [], removed: [] }, fonts: [], logo: null, form: 0 };
  const wipedUploads: string[] = [];
  for (const key of doAssets ? new Set([...Object.keys(pkgs), ...fresh.keys()]) : new Set<string>()) {
    const cur = pkgs[key] || {};
    const prevFig = new Map((cur.files || []).filter((f) => f.fromFigma).map((f) => [f.name, f]));
    const uploads = (cur.files || []).filter((f) => !f.fromFigma);
    const incoming = fresh.get(key) || [];
    const keepUploads = wipe ? [] : uploads;
    if (wipe) wipedUploads.push(...uploads.map((u) => u.path));
    const files = mode === 'add' ? [...(cur.files || []), ...incoming.filter((f) => !prevFig.has(f.name))] : [...keepUploads, ...incoming];
    const title = key.startsWith('custom-') ? cur.title || t.assets.find((a) => a.pkg === key)?.title : cur.title;
    const changed = (f: PkgFile) => { const o = prevFig.get(f.name)!; return o.hash && f.hash ? o.hash !== f.hash : o.bytes !== f.bytes || o.path !== f.path; };
    const entry = {
      key, title: title || PKG_TITLE[key] || key,
      added: incoming.filter((f) => !prevFig.has(f.name)).map((f) => f.name),
      updated: mode === 'add' ? [] : incoming.filter((f) => prevFig.has(f.name) && (mode === 'fresh' || changed(f))).map((f) => f.name),
      removed: mode === 'add' ? [] : [...prevFig.values()].filter((f) => !incoming.some((x) => x.name === f.name)).map((f) => f.name),
      unchanged: mode === 'fresh' ? 0 : incoming.filter((f) => prevFig.has(f.name) && (mode === 'add' || !changed(f))).length,
      uploads: keepUploads.length, uploadsRemoved: wipe ? uploads.map((u) => u.name) : []
    };
    if (entry.added.length + entry.updated.length + entry.removed.length + entry.unchanged + entry.uploadsRemoved.length) report.packages.push(entry);
    if (!files.length && key.startsWith('custom-') && !cur.purpose) { delete pkgs[key]; continue; }
    if (!incoming.length && !prevFig.size && !wipe) continue;
    pkgs[key] = { ...cur, ...(title ? { title } : {}), files, ...(incoming.length ? { enabled: true } : {}) };
  }
  const nowUsed = new Set([...fresh.values()].flat().map((f) => f.path));
  const stale = mode === 'add' || !doAssets ? [] : [...oldFigma.filter((x) => !nowUsed.has(x)), ...wipedUploads];
  // Earlier imports stored files without the hash in the name; anything left in a package folder that nothing lists any more goes too
  if (doAssets && mode !== 'add') {
    const listed = new Set([...Object.values(pkgs).flatMap((x) => (x.files || []).map((f) => f.path)), ...Object.values(pkgs).map((x) => x.cover).filter(Boolean) as string[]]);
    for (const key of new Set([...Object.keys(pkgs), ...fresh.keys()])) {
      const { data: list } = await sb.storage.from('kits').list(`${projectId}/packages/${key}`, { limit: 1000 });
      for (const o of list || []) { const path = `${projectId}/packages/${key}/${o.name}`; if (o.id && o.name.startsWith('figma-') && !listed.has(path) && !stale.includes(path)) stale.push(path); }
    }
  }
  for (let i = 0; i < stale.length; i += 100) await sb.storage.from('kits').remove(stale.slice(i, i + 100));
  if (doAssets) { const lg = pickLogo((pkgs.logos?.files || []).filter((f) => /\.(svg|png)$/i.test(f.name)).map((f) => ({ path: 'assets/logo/' + f.name, storage_path: f.path }))); report.logo = lg.main ? { name: lg.main.path.split('/').pop()!, light: lg.light?.path.split('/').pop() } : null; }

  // 4. Showcase: from the template until the studio changes it in the platform
  const sc = readShowcase(content);
  const studioEdited = sc.rows.some((r) => !r.fromFigma);
  const rows: ShowcaseRow[] = t.showcase.map((r, i) => ({ id: 'f-' + i + '-' + r.frames[0].nodeId.replace(/[^0-9a-z]/gi, ''), layout: r.layout, fromFigma: true, frames: r.frames.map((f) => (stored[f.nodeId] ? { kind: 'image' as const, path: stored[f.nodeId].path } : { kind: 'empty' as const })) }));
  const known = new Set(sc.rows.map((r) => r.id));
  const showcase = !doGuide || opts.showcase === false ? content.showcase : mode === 'add' ? (rows.some((r) => !known.has(r.id)) ? { ...sc, rows: [...sc.rows, ...rows.filter((r) => !known.has(r.id))] } : content.showcase) : studioEdited || !rows.length ? content.showcase : { ...sc, rows };

  // 5. Brand basics: palette and type roles from the template; line and welcome only where not already set
  const update: Record<string, unknown> = {};
  const nextBrand: Record<string, unknown> = { ...brand };
  const core = (brand.core || []);
  if (doAssets && t.colours.length) {
    const next = mode === 'add' && core.length ? [...core, ...t.colours.filter((c) => !core.some((x) => x.hex.toUpperCase() === c.hex.toUpperCase())).map((c) => ({ name: c.name, hex: c.hex, note: c.role }))] : t.colours.map((c) => ({ name: c.name, hex: c.hex, note: c.role }));
    const has = (l: { hex: string }[], h: string) => l.some((x) => x.hex.toUpperCase() === h.toUpperCase());
    report.colours = { total: next.length, added: next.filter((c) => !has(core, c.hex)).map((c) => `${c.name} ${c.hex.toUpperCase()}`), removed: core.filter((c) => !has(next, c.hex)).map((c) => `${c.name} ${c.hex.toUpperCase()}`) };
    nextBrand.core = next;
  } else if (doAssets) report.colours = { total: core.length, added: [], removed: [] };
  if (doAssets && t.fonts.length) {
    // Figma names the families; the font files themselves are uploaded in the platform (Figma can't hand them over).
    // Starting over keeps uploaded files only where the family is the same.
    const same = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
    const before = [...(brand.fonts || [])];
    const fonts = mode === 'fresh' ? t.fonts.map((f) => { const o = before.find((x) => x.role === f.role); return { ...(o || {}), role: f.role, name: f.family, label: f.use || o?.label || '', files: o && same(o.name, f.family) ? o.files || [] : [] }; }) : before;
    if (mode !== 'fresh') for (const f of t.fonts) { const i = fonts.findIndex((x) => x.role === f.role); if (i < 0) fonts.push({ role: f.role, name: f.family, label: f.use || '', files: [] }); else if (mode === 'update' && !(fonts[i].files || []).length) fonts[i] = { ...fonts[i], name: f.family }; else if (!fonts[i].name) fonts[i] = { ...fonts[i], name: f.family }; }
    nextBrand.fonts = fonts;
    report.fonts = fonts.map((f) => { const fig = t.fonts.find((x) => x.role === f.role); const n = (f.files || []).length; const dropped = mode === 'fresh' ? before.find((x) => x.role === f.role && (x.files || []).length && !same(x.name, fig?.family)) : undefined;
      return { role: f.role, family: f.name || fig?.family || '', files: n, note: dropped ? `${dropped.name} files unlinked; upload ${fig?.family}` : fig && n && !same(f.name, fig.family) ? `Figma now uses ${fig.family}; the uploaded files are ${f.name}` : !n ? 'No font files uploaded yet' : undefined }; });
  }
  update.brand = nextBrand;
  // The form: kept whole, so the portal and every AI document read the same answers. Depth sets the tier once.
  const tier = TIERS.find((x) => t.form.depth && x.label.toLowerCase() === t.form.depth.trim().toLowerCase())?.id;
  if (doAssets) { report.form = Object.values(t.form).filter(Boolean).length; report.line = t.brand.line; }
  update.content = doAssets
    ? { ...content, assetsReport: report, form: mode === 'add' ? { ...t.form, ...((content as { form?: object }).form || {}) } : t.form, ...(tier && !(content as { tier?: string }).tier ? { tier } : {}), ...(doGuide ? { guide, showcase } : {}), packages: pkgs, ...(t.brand.intro && !content.homeIntro ? { homeIntro: t.brand.intro } : {}), typeScale: t.styles.length ? t.styles : (content as { typeScale?: unknown }).typeScale }
    : { ...content, guide, showcase };
  const { data: proj } = await sb.from('projects').select('line').eq('id', projectId).single();
  if (doAssets && t.brand.line && (mode === 'fresh' || !proj?.line)) update.line = t.brand.line;
  const { error } = await sb.from('projects').update(update).eq('id', projectId);
  if (error) throw error;

  // Tidy guide images from earlier builds that nothing uses any more
  const before = normaliseGuide(raw.guide);
  if (before && doGuide) {
    const keep = new Set(guidePaths(guide));
    const old = guidePaths(before).filter((x) => !keep.has(x) && !x.includes('/guide/uploads/'));
    for (let i = 0; i < old.length; i += 100) await sb.storage.from('previews').remove(old.slice(i, i + 100));
  }
  return guide;
}
