import { zipSync, strToU8 } from 'fflate';
import { adminClient } from '@/lib/supabase/server';
import { portalContext } from '@/lib/portal/context';
import { designSystemFiles } from '@/lib/designSystem';
import { getPlaybook } from '@/lib/playbookStore';
import { logActivity } from '@/lib/activity';

export const maxDuration = 60;

// The brand as a design system for AI, as a .zip that uploads to Claude as a skill.
export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const pc = await portalContext(slug);
  if (!pc?.snap) return new Response('Not found', { status: 404 });
  const files = pc.files.filter((f) => f.storage_path && (pc.preview || f.partStatus === 'ready'));
  const ds = designSystemFiles(pc.snap, pc.fonts, files.map((f) => f.path), (await getPlaybook()).aiDonts);
  const tree: Record<string, Uint8Array> = Object.fromEntries(Object.entries(ds.files).map(([k, v]) => [`${ds.folder}/${k}`, strToU8(v)]));
  const sb = adminClient();
  await Promise.all(files.filter((f) => ds.include.includes(f.path)).map(async (f) => {
    const { data } = await sb.storage.from('kits').download(f.storage_path!);
    if (data) tree[`${ds.folder}/${f.path}`] = new Uint8Array(await data.arrayBuffer());
  }));
  const zip = zipSync(tree, { level: 6 });
  if (!pc.preview) await logActivity(pc.project.id, pc.access.user.id, 'skill', 'design-system');
  return new Response(zip, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${ds.folder}.zip"`, 'Cache-Control': 'no-store' } });
}
