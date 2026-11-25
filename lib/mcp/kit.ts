import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { adminClient } from '@/lib/supabase/server';
import type { Snapshot } from '@/lib/ai/project';
import { fillMedia, type Block, type BlockMedia } from '@/lib/figma/blocks';
import { withFigmaLogos } from '@/lib/portal/logo';
import { readFonts, FONT_BUCKET } from '@/lib/projects/fonts';
import { weightName, type ProjectFont } from '@/lib/fonts';
import { systemFor, TYPE_IDS, TYPE_USE, SPACE_RULES } from '@/lib/guideSystem';
import { templateLabel } from '@/lib/kit/build';
import { fileLink } from '@/lib/mcp/links';
import { isPlaceholder } from '@/lib/mcp/gaps';

// Everything the connector reads for one project, from the published snapshot and the kit's published files.
// Links are stable platform links (see lib/mcp/links.ts); images can also be sent through the connector itself.

export type ConnectorSettings = { shareFontFiles: boolean };
export const readConnector = (content: unknown): ConnectorSettings => ({ shareFontFiles: (content as { connector?: { shareFontFiles?: unknown } } | null)?.connector?.shareFontFiles === true });

export type KitProject = { id: string; slug: string; client: string; content: unknown; mcp_token_hash: string };
export type KitFile = { path: string; storage_path: string | null; part: string; status: string };
export type KitImage = { id: string; name: string; caption?: string; chapter?: string; section?: string; /** Which section of the chapter, from 0 */ at?: number; kind: 'photo' | 'graphic' | 'page' | 'showcase' | 'asset'; bucket: 'previews' | 'kits'; path: string; w?: number; h?: number; video?: boolean; url: string };
export type KitTemplate = { id: string; name: string; status: string; storage_path: string };

const FONT_FILE = /^assets\/fonts\/.+\.(woff2?|otf|ttf)$/i;
const VIDEO = /\.(mp4|webm|mov)$/i;
const VIEWABLE = /\.(png|jpe?g|webp|gif|svg|avif|tiff?)$/i;
const idFor = (prefix: string, path: string) => prefix + createHash('sha1').update(path).digest('hex').slice(0, 10);

/** The kit files clients can see (visible parts), with Figma logos in place of the kit's, as the portal shows them.
 *  Font files are left out unless the studio shares them. */
export async function kitFiles(p: Pick<KitProject, 'id' | 'content'>): Promise<KitFile[]> {
  const { data } = await adminClient().from('deliverable_parts').select('key, status, visible, deliverable_files(path, storage_path)').eq('project_id', p.id).eq('visible', true);
  const rows = (data || []).flatMap((d) => ((d.deliverable_files || []) as { path: string; storage_path: string | null }[]).map((f) => ({ ...f, part: d.key as string, status: d.status as string })));
  const files = withFigmaLogos(rows, p.content, { part: 'assets', status: 'ready' });
  const share = readConnector(p.content).shareFontFiles;
  return files.filter((f) => f.storage_path && (share || !FONT_FILE.test(f.path)));
}

/** Every image in the published guidelines (section images, frames' images, backdrops and, for sections the studio
 *  hasn't changed, the guideline page as designed), with its chapter and section */
export function guideImages(s: Snapshot): Omit<KitImage, 'url'>[] {
  const out: Omit<KitImage, 'url'>[] = [];
  const seen = new Set<string>();
  for (const c of s.guide?.chapters || []) {
    let n = 0;
    c.blocks.forEach((b: Block, i) => {
      const section = b.heading && !isPlaceholder(b.heading) ? b.heading.replace(/\s+/g, ' ').trim() : undefined;
      const add = (m: BlockMedia | undefined, kind?: KitImage['kind']) => {
        if (!m?.path || seen.has(m.path)) return; seen.add(m.path);
        const caption = m.caption && !isPlaceholder(m.caption) ? m.caption : undefined;
        n++;
        out.push({ id: idFor('img-', m.path), name: caption || `${c.title}${section ? ` · ${section}` : ''} · image ${n}`, caption, chapter: c.title, section: section || `Section ${i + 1}`, at: i, kind: kind || m.kind, bucket: 'previews', path: m.path, w: m.w, h: m.h, video: m.video || VIDEO.test(m.path) || undefined });
      };
      add(b.backdrop);
      for (const m of b.media || []) add(m);
      for (const it of (b.items || []).filter((x) => !x.hidden)) { add(it.media); add(fillMedia(it.look)); for (const e of (it.els || []).filter((x) => !x.hidden)) { add(e.media); add(fillMedia(e.look)); } }
      if (b.original && !b.edited && !seen.has(b.original)) { seen.add(b.original); out.push({ id: idFor('img-', b.original), name: `${c.title} · ${section || `section ${i + 1}`} · the guideline page as designed`, chapter: c.title, section: section || `Section ${i + 1}`, at: i, kind: 'page', bucket: 'previews', path: b.original }); }
    });
  }
  for (const r of s.showcase?.rows || []) for (const f of r.frames) {
    if (!f.path || (f.kind !== 'image' && f.kind !== 'video') || seen.has(f.path)) continue; seen.add(f.path);
    const caption = f.caption && !isPlaceholder(f.caption) ? f.caption : undefined;
    out.push({ id: idFor('show-', f.path), name: caption || `Showcase · ${f.kind}`, caption, chapter: s.showcase?.nav || 'Showcase', kind: 'showcase', bucket: 'previews', path: f.path, video: f.kind === 'video' || VIDEO.test(f.path) || undefined });
  }
  return out;
}

export type Kit = Awaited<ReturnType<typeof loadKit>>;

/** The connector's view of a project: published snapshot, kit files, images, typefaces and templates, with links. */
export async function loadKit(p: KitProject, snap: Snapshot, origin: string) {
  const settings = readConnector(p.content);
  const link = (kind: 'kit' | 'img' | 'font', path: string) => fileLink(origin, p.mcp_token_hash, p.slug, kind, path);
  const files = await kitFiles(p).catch(() => [] as KitFile[]);
  const assets = files.filter((f) => f.path.startsWith('assets/')).map((f) => ({ id: f.path, path: f.path, url: link('kit', f.path), viewable: VIEWABLE.test(f.path) }));
  const images: KitImage[] = guideImages(snap).map((x) => ({ ...x, url: link('img', x.path) }));
  const assetImages: KitImage[] = files.filter((f) => f.path.startsWith('assets/') && VIEWABLE.test(f.path)).map((f) => ({ id: f.path, name: f.path.split('/').pop()!, kind: 'asset', bucket: 'kits', path: f.storage_path!, url: link('kit', f.path) }));
  const templates: KitTemplate[] = files.flatMap((f) => { const m = f.path.match(/^templates\/([^/]+)\/index\.html$/); return m ? [{ id: m[1], name: templateLabel(m[1]), status: f.status, storage_path: f.storage_path! }] : []; });
  const templatesPart = await adminClient().from('deliverable_parts').select('status, visible').eq('project_id', p.id).eq('key', 'templates').maybeSingle().then((r) => r.data, () => null);
  const fonts = await readFonts(p.id).then((r) => r.fonts, () => [] as ProjectFont[]);
  return {
    snapshot: snap, settings, assets, images, templates, templatesPart,
    tokens: kitTokens(snap, p.content, fonts, settings.shareFontFiles ? (path) => link('font', path) : null),
    /** An image by its id (or kit path) */
    findImage: (id: string) => images.find((x) => x.id === id || x.path === id) || assetImages.find((x) => x.id === id || x.id === id.replace(/^\//, '')),
    template: async (id: string) => { const t = templates.find((x) => x.id === id); if (!t) return null; const { data } = await adminClient().storage.from('kits').download(t.storage_path); return data ? await data.text() : null; }
  };
}

/** Design tokens (W3C format) from the published snapshot and the guide's type styles: colours, each typeface with
 *  the weights it comes in and when each is used, the text styles (h1 to caption), and the spacing. */
export function kitTokens(s: Snapshot, content: unknown, fonts: ProjectFont[], fontLink: ((path: string) => string) | null) {
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const color: Record<string, unknown> = {};
  for (const c of s.colours) color[slug(c.name) || slug(c.role) || c.hex.slice(1)] = { $type: 'color', $value: c.hex, $description: [c.name, c.role].filter(Boolean).join(' · ') };
  const pc = (content || {}) as { typeScale?: never; dsProfile?: never };
  const sys = systemFor(s.guide?.system, { typeScale: pc.typeScale, profile: pc.dsProfile, fonts: fonts.filter((f) => f.files.length) });
  const family = (role: string) => s.fonts.find((f) => f.role === role)?.name || fonts.find((f) => f.role === role)?.name || role;
  const caseName: Record<string, string> = { upper: 'uppercase', lower: 'lowercase', sentence: 'sentence case', title: 'title case', smallcaps: 'small caps' };
  const typography: Record<string, unknown> = {};
  for (const id of TYPE_IDS) {
    const d = sys.type[id];
    typography[id] = { $type: 'typography', $value: { fontFamily: family(d.font), fontWeight: d.weight, fontSize: { value: d.size, unit: 'px' }, lineHeight: d.leading, letterSpacing: { value: d.tracking, unit: 'em' }, ...(d.case ? { textCase: caseName[d.case] || d.case } : {}) },
      $description: `${d.name}: ${TYPE_USE[id]}. ${family(d.font)} ${weightName(d.weight)} (${d.weight}), ${d.size}px on ${d.leading} leading${d.tracking ? `, ${Math.round(d.tracking * 1000) / 10}% tracking` : ''}${d.case ? `, ${caseName[d.case] || d.case}` : ''}.` };
  }
  const font: Record<string, unknown> = {};
  for (const f of s.fonts) {
    const pf = fonts.find((x) => x.role === f.role && x.name === f.name) || fonts.find((x) => x.role === f.role);
    const uses = TYPE_IDS.filter((id) => sys.type[id].font === f.role);
    const fileWeights = [...new Set((pf?.files || []).map((x) => x.weight))];
    const weights = [...new Set([...fileWeights, ...uses.map((id) => sys.type[id].weight)])].sort((a, b) => a - b);
    const styles = (w: number) => [...new Set((pf?.files || []).filter((x) => x.weight === w).map((x) => x.style))];
    const licensed = (pf?.files || []).filter((x) => x.licence === 'licensed');
    font[f.role] = {
      family: { $type: 'fontFamily', $value: [f.name, 'sans-serif'] },
      $description: f.usage || undefined,
      weights: Object.fromEntries(weights.map((w) => { const u = uses.filter((id) => sys.type[id].weight === w); return [weightName(w).toLowerCase().replace(/\s+/g, '-'), { $type: 'fontWeight', $value: w,
        $description: `${weightName(w)}${styles(w).length ? ` (${styles(w).join(' and ')})` : ''}. ${u.length ? 'Use for ' + u.map((id) => `${id} ${sys.type[id].name.toLowerCase()} (${TYPE_USE[id].toLowerCase()})`).join('; ') + '.' : 'Available, not set for a text style in the guidelines.'}${fileWeights.length && !fileWeights.includes(w) ? ' No file uploaded in this weight yet.' : ''}` }]; })),
      files: fontLink
        ? licensed.length ? licensed.map((x) => ({ name: x.name, weight: x.weight, style: x.style, format: x.format, url: fontLink(x.path) })) : `No licensed ${f.name} files have been uploaded yet. Ask Lost Property for the files or a licence.`
        : `${f.name} is licensed by Lost Property; font files aren't shared through this connector. Ask Lost Property for the files or a licence.${pf?.licenceNote ? ` Licence: ${pf.licenceNote}` : ''}`
    };
  }
  const label = Object.fromEntries(SPACE_RULES.map((r) => [r.id, r]));
  const space: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sys.space)) space[k] = { $type: 'dimension', $value: { value: v, unit: 'px' }, $description: label[k] ? `${label[k].label}: ${label[k].help}` : undefined };
  return { $description: `${s.client} brand tokens, from the published guidelines. Text styles give the weight to use for each kind of text; use only the listed weights.`, color, font, typography, space };
}

/** An image as an MCP image block: at most 1600px on its longest side, PNG when it has transparency, JPEG otherwise */
export async function imageBlock(img: KitImage): Promise<{ type: 'image'; data: string; mimeType: string } | null> {
  if (img.video) return null;
  const { data } = await adminClient().storage.from(img.bucket).download(img.path);
  if (!data) return null;
  try {
    const input = Buffer.from(await data.arrayBuffer());
    const pic = sharp(input, { density: /\.svg$/i.test(img.path) ? 200 : undefined, failOn: 'none' }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: !/\.svg$/i.test(img.path) });
    const meta = await sharp(input, { failOn: 'none' }).metadata();
    const png = !!meta.hasAlpha;
    let out = await (png ? pic.png({ compressionLevel: 9, palette: false }) : pic.jpeg({ quality: 82, mozjpeg: true })).toBuffer();
    // A large transparent picture: flatten onto white as JPEG rather than send several megabytes
    if (png && out.byteLength > 1_500_000) { out = await sharp(out).flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer(); return { type: 'image', data: out.toString('base64'), mimeType: 'image/jpeg' }; }
    return { type: 'image', data: out.toString('base64'), mimeType: png ? 'image/png' : 'image/jpeg' };
  } catch { return null; }
}

/** Storage location of a file behind a stable link, checked against what the connector may serve right now */
export async function linkTarget(p: KitProject, snap: Snapshot | null, kind: 'kit' | 'img' | 'font', path: string): Promise<{ bucket: string; path: string } | null> {
  if (kind === 'kit') { if (!path.startsWith('assets/')) return null; const f = (await kitFiles(p).catch(() => [])).find((x) => x.path === path); return f?.storage_path ? { bucket: 'kits', path: f.storage_path } : null; }
  if (kind === 'img') return snap && guideImages(snap).some((x) => x.path === path) ? { bucket: 'previews', path } : null;
  if (!readConnector(p.content).shareFontFiles) return null;
  const fonts = await readFonts(p.id).then((r) => r.fonts, () => [] as ProjectFont[]);
  return fonts.some((f) => f.files.some((x) => x.path === path && x.licence === 'licensed')) ? { bucket: FONT_BUCKET, path } : null;
}
