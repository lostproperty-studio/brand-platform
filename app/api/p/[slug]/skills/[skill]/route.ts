import { zipSync, strToU8 } from 'fflate';
import { adminClient } from '@/lib/supabase/server';
import { portalContext } from '@/lib/portal/context';
import { SKILLS, skillFiles, type SkillId } from '@/lib/skills';
import { logActivity } from '@/lib/activity';

export const maxDuration = 60;

// Downloads a generated Claude skill as a .zip: SKILL.md, the brand reference and the brand files it needs.
export async function GET(_: Request, ctx: { params: Promise<{ slug: string; skill: string }> }) {
  const { slug, skill } = await ctx.params;
  if (!SKILLS.some((s) => s.id === skill)) return new Response('Not found', { status: 404 });
  const pc = await portalContext(slug);
  if (!pc?.snap) return new Response('Not found', { status: 404 });
  // Clients only get files from parts the studio has marked Ready
  const files = pc.files.filter((f) => f.storage_path && (pc.preview || f.partStatus === 'ready') && !/LICENCE|manifest/.test(f.path));
  const s = skillFiles(skill as SkillId, pc.snap, pc.fonts, files.map((f) => f.path));
  const tree: Record<string, Uint8Array> = { [`${s.folder}/SKILL.md`]: strToU8(s.md), [`${s.folder}/reference/brand.md`]: strToU8(s.reference) };
  const sb = adminClient();
  await Promise.all(files.filter((f) => s.include.includes(f.path)).map(async (f) => {
    const { data } = await sb.storage.from('kits').download(f.storage_path!);
    if (data) tree[`${s.folder}/${f.path}`] = new Uint8Array(await data.arrayBuffer());
  }));
  const zip = zipSync(tree, { level: 6 });
  if (!pc.preview) await logActivity(pc.project.id, pc.access.user.id, 'skill', skill);
  return new Response(zip, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${s.folder}.zip"`, 'Cache-Control': 'no-store' } });
}
