import { zipSync, strToU8 } from 'fflate';
import { adminClient } from '@/lib/supabase/server';
import { portalContext } from '@/lib/portal/context';
import { SKILLS, skillFiles, type SkillId } from '@/lib/skills';
import { designSystemFiles } from '@/lib/designSystem';
import { dsSource } from '@/lib/designSystemSource';
import { logActivity } from '@/lib/activity';

export const maxDuration = 60;

// Downloads a generated Claude skill as a .zip: SKILL.md, the brand reference, the design system (tokens,
// components, spec, layouts) and the brand files it needs. Built from the same source as the design system.
export async function GET(_: Request, ctx: { params: Promise<{ slug: string; skill: string }> }) {
  const { slug, skill } = await ctx.params;
  if (!SKILLS.some((s) => s.id === skill)) return new Response('Not found', { status: 404 });
  const pc = await portalContext(slug);
  if (!pc?.snap) return new Response('Not found', { status: 404 });
  // Clients only get files from parts the studio has marked Ready (dsSource applies the same rule)
  const { input, storage } = await dsSource(pc);
  for (const p of [...storage.keys()]) if (/LICENCE|manifest/.test(p)) storage.delete(p);
  const ds = designSystemFiles(input);
  const s = skillFiles(skill as SkillId, pc.snap, pc.fonts, [...storage.keys()], input.aiDonts, ds);
  const tree: Record<string, Uint8Array> = { [`${s.folder}/SKILL.md`]: strToU8(s.md), [`${s.folder}/reference/brand.md`]: strToU8(s.reference), [`${s.folder}/reference/voice.md`]: strToU8(s.voice) };
  for (const [k, v] of Object.entries(s.design)) tree[`${s.folder}/${k}`] = strToU8(v);
  const sb = adminClient();
  await Promise.all(s.include.map(async (p) => {
    const at = storage.get(p); if (!at) return;
    const { data } = await sb.storage.from('kits').download(at);
    if (data) tree[`${s.folder}/${p}`] = new Uint8Array(await data.arrayBuffer());
  }));
  const zip = zipSync(tree, { level: 6 });
  if (!pc.preview) await logActivity(pc.project.id, pc.access.user.id, 'skill', skill);
  return new Response(zip, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${s.folder}.zip"`, 'Cache-Control': 'no-store' } });
}
