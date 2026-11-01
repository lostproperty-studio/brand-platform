import { zipSync, strToU8 } from 'fflate';
import { adminClient } from '@/lib/supabase/server';
import { portalContext } from '@/lib/portal/context';
import { portalPackages } from '@/lib/portal/packages';
import { avatarSvgs, colourFiles, pickAvatarLogos } from '@/lib/portal/generated';
import { logActivity } from '@/lib/activity';

export const maxDuration = 60;
const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const KIT_PREFIX = /^(assets\/(logo|fonts|icons?|imagery|images|photography|patterns?|graphics?)\/|team\/)/;

// Downloads a whole package as one .zip (or one file from it with ?file=). Logged, so the studio sees what's used.
export async function GET(req: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  const pc = await portalContext(slug);
  if (!pc?.snap) return new Response('Not found', { status: 404 });
  const pkg = (await portalPackages(pc)).find((p) => p.id === id);
  if (!pkg || (!pc.preview && (pkg.hidden || !pkg.enabled))) return new Response('Not found', { status: 404 });
  if (!pkg.ready) return new Response('Not available yet', { status: 404 });
  const sb = adminClient();
  const one = new URL(req.url).searchParams.get('file');
  if (one) {
    const up = pkg.uploads.find((u) => u.name === one);
    const kit = pkg.kitFiles.find((f) => f.path === one);
    const path = up?.path || kit?.storage_path;
    if (!path) return new Response('Not found', { status: 404 });
    const { data } = await sb.storage.from('kits').createSignedUrl(path, 300, { download: one.split('/').pop() });
    if (!pc.preview) await logActivity(pc.project.id, pc.access.user.id, 'download', `${pkg.title}: ${one}`);
    return data?.signedUrl ? Response.redirect(data.signedUrl, 302) : new Response('Not found', { status: 404 });
  }

  const tree: Record<string, Uint8Array> = {};
  const get = async (path: string) => { const { data } = await sb.storage.from('kits').download(path); return data ? new Uint8Array(await data.arrayBuffer()) : null; };
  const kitLicence = pkg.kind === 'fonts' ? pc.files.find((f) => f.path === 'assets/fonts/LICENCE.md') : undefined;
  await Promise.all([...pkg.kitFiles, ...(kitLicence ? [kitLicence] : [])].map(async (f) => { if (!f.storage_path) return; const b = await get(f.storage_path); if (b) tree[f.path.replace(KIT_PREFIX, '')] = b; }));
  await Promise.all(pkg.uploads.map(async (u) => { const b = await get(u.path); if (b) tree[u.name] = b; }));
  if (pkg.kind === 'colours') for (const [n, c] of Object.entries(colourFiles(pc.project.client, pc.snap.colours))) tree[n] = typeof c === 'string' ? strToU8(c) : c;
  if (pkg.kind === 'avatars' && !pkg.uploads.length) {
    const pick = pickAvatarLogos(pc.files.map((f) => f.path));
    const text = async (p?: string) => { const f = p ? pc.files.find((x) => x.path === p) : undefined; const b = f?.storage_path ? await get(f.storage_path) : null; return b ? new TextDecoder().decode(b) : undefined; };
    const any = await text(pick.any);
    if (any) for (const [n, svg] of Object.entries(avatarSvgs(pc.project.client, pc.snap.colours, { any, light: await text(pick.light), dark: await text(pick.dark) }))) tree[n] = strToU8(svg);
  }
  if (!Object.keys(tree).length) return new Response('Nothing in this package yet', { status: 404 });
  const folder = `${kebab(pc.project.client)}-${kebab(pkg.title)}`;
  const zip = zipSync(Object.fromEntries(Object.entries(tree).map(([k, v]) => [`${folder}/${k}`, v])), { level: 6 });
  if (!pc.preview) await logActivity(pc.project.id, pc.access.user.id, 'download', `${pkg.title} (package)`);
  return new Response(zip, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${folder}.zip"`, 'Cache-Control': 'no-store' } });
}
