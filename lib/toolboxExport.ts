import { timingSafeEqual } from 'node:crypto';
import { adminClient } from '@/lib/supabase/server';
import { buildSnapshot } from '@/lib/projects/snapshot';
import { normaliseGuide, chapterText, keyFor, type Guide } from '@/lib/portal/guide';
import { chapterPhotos } from '@/lib/portal/covers';
import { pickLogo, withFigmaLogos } from '@/lib/portal/logo';
import { signMany } from '@/lib/storage/signed';

// A private export for the studio's Toolbox (toolbox.lostproperty.studio), so Mockup Studio can fill a project from a
// brand's guidelines. Studio-only: it answers only to the shared TOOLBOX_API_KEY, never to clients or the public,
// and changes nothing on the platform. It reads the working copy, so the Toolbox sees the latest guidelines.

export function toolboxAuthorised(req: Request) {
  const secret = process.env.TOOLBOX_API_KEY || '';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (secret.length < 24 || !got) return false;
  const a = Buffer.from(got), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function toolboxBrands() {
  const { data } = await adminClient().from('projects').select('slug, client, name, status, updated_at').neq('status', 'archived').order('updated_at', { ascending: false });
  return (data || []).map((p) => ({ slug: p.slug, client: p.client, name: p.name, status: p.status, updated_at: p.updated_at }));
}

const IMAGE = /\.(png|jpe?g|webp|svg)$/i;

export async function toolboxBrand(slug: string) {
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('id, slug, client, name, line, content').eq('slug', slug).neq('status', 'archived').maybeSingle();
  if (!p) return null;
  const snap = await buildSnapshot(p.id);
  const guide = normaliseGuide((p.content as { guide?: Guide } | null)?.guide);
  const chapters = (guide?.chapters || []).filter((c) => !c.hidden && !c.removed);
  // Art direction: the imagery / photography / art direction chapter(s)
  const imagery = chapters.filter((c) => (c.key || keyFor(c.title)) === 'imagery' || /art direction|photograph/i.test(c.title));
  const imageryText = imagery.flatMap((c) => [c.lede, ...c.rules.map((r) => (r.title && r.title !== 'From the guidelines' ? `${r.title}: ${r.text}` : r.text)), ...chapterText(c)])
    .map((t) => (t || '').replace(/\s+/g, ' ').trim()).filter((t) => t.length > 12);
  // Logos (the kit's, or the ones imported from Figma), SVG/PNG, the main ones first
  const { data: parts } = await sb.from('deliverable_parts').select('deliverable_files(path, format, storage_path)').eq('project_id', p.id);
  const kit = (parts || []).flatMap((d) => (d.deliverable_files || []) as { path: string; format: string; storage_path: string | null }[]);
  const files = withFigmaLogos(kit, p.content, { format: 'svg' });
  const { main, light } = pickLogo(files);
  const logos = [main, light, ...files.filter((f) => f.path.startsWith('assets/logo/') && /\.(svg|png)$/i.test(f.path))]
    .filter((f, i, all): f is NonNullable<typeof f> => !!f?.storage_path && all.findIndex((x) => x?.path === f.path) === i).slice(0, 6);
  const kitImages = files.filter((f) => /^assets\/(imagery|images|photography)\//.test(f.path) && IMAGE.test(f.path) && f.storage_path).slice(0, 12);
  const chapterImgs = [...new Set(imagery.flatMap((c) => chapterPhotos(c)))].slice(0, 12);
  // Signed for an hour: long enough for the Toolbox to copy them
  const [kitUrls, prevUrls] = await Promise.all([
    signMany('kits', [...logos, ...kitImages].map((f) => f.storage_path!), 3600),
    signMany('previews', chapterImgs, 3600)
  ]);
  const kitUrl = (path: string) => kitUrls.data.find((d) => d.path === path)?.signedUrl;
  const prevUrl = (path: string) => prevUrls.data.find((d) => d.path === path)?.signedUrl;
  const name = (path: string) => path.split('/').pop()!.replace(/\.[^.]+$/, '');
  return {
    slug: p.slug, client: p.client, name: p.name, line: snap.line || '',
    colours: snap.colours.map((c) => ({ name: c.name, hex: c.hex, role: c.role })),
    fonts: snap.fonts.map((f) => ({ name: f.name, role: f.role, usage: f.usage })),
    design: snap.design || [],
    artDirection: { chapters: imagery.map((c) => c.title), text: [...new Set(imageryText)].slice(0, 40) },
    logos: logos.map((f) => ({ name: name(f.path), url: kitUrl(f.storage_path!), light: /white|light|reverse|negative|inverse/i.test(f.path) })).filter((l) => l.url),
    images: [...chapterImgs.map((path) => ({ name: name(path), url: prevUrl(path), from: 'guidelines' })), ...kitImages.map((f) => ({ name: name(f.path), url: kitUrl(f.storage_path!), from: 'kit' }))].filter((i) => i.url).slice(0, 16)
  };
}
