import { zipSync, strToU8 } from 'fflate';
import { adminClient } from '@/lib/supabase/server';
import { portalContext } from '@/lib/portal/context';
import { designSystemFiles } from '@/lib/designSystem';
import { dsSource } from '@/lib/designSystemSource';
import { logActivity } from '@/lib/activity';

export const maxDuration = 60;

// The brand as a design system for AI, as a .zip that uploads to Claude as a skill.
export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const pc = await portalContext(slug);
  if (!pc?.snap) return new Response('Not found', { status: 404 });
  const { input, storage } = await dsSource(pc);
  const ds = designSystemFiles(input);
  const tree: Record<string, Uint8Array> = Object.fromEntries(Object.entries(ds.files).map(([k, v]) => [`${ds.folder}/${k}`, strToU8(v)]));
  const sb = adminClient();
  await Promise.all([...new Set(ds.include)].map(async (p) => {
    const at = storage.get(p); if (!at) return;
    const { data } = await sb.storage.from('kits').download(at);
    if (data) tree[`${ds.folder}/${p}`] = new Uint8Array(await data.arrayBuffer());
  }));
  const zip = zipSync(tree, { level: 6 });
  if (!pc.preview) await logActivity(pc.project.id, pc.access.user.id, 'skill', 'design-system');
  return new Response(zip, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${ds.folder}.zip"`, 'Cache-Control': 'no-store' } });
}
