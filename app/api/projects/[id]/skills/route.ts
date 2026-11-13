import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { portalContext } from '@/lib/portal/context';
import { dsSource } from '@/lib/designSystemSource';
import { designSystemFiles } from '@/lib/designSystem';
import { SKILLS, readSkillSettings, skillChecks, skillFiles, skillShown, type SkillId } from '@/lib/skills';

export const maxDuration = 60;

// The Claude skills, previewed for the studio: what each tells Claude, the files it carries, whether it has what it
// needs, and whether clients see it.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'viewer', 'project'); if (gate) return gate; }
  const { data: p } = await adminClient().from('projects').select('slug, content').eq('id', id).single();
  const pc = p?.slug ? await portalContext(p.slug) : null;
  if (!pc?.snap) return NextResponse.json({ error: 'Publish the guidelines first: skills are written from them.' }, { status: 400 });
  const { input, storage } = await dsSource(pc);
  for (const k of [...storage.keys()]) if (/LICENCE|manifest/.test(k)) storage.delete(k);
  const ds = designSystemFiles(input);
  const files = [...storage.keys()];
  const settings = readSkillSettings(p?.content);
  const skills = SKILLS.map((s) => {
    const f = skillFiles(s.id as SkillId, pc.snap!, pc.fonts, files, input.aiDonts, ds);
    const checks = skillChecks(s.id as SkillId, pc.snap!, pc.fonts, files, f.voice);
    const list = ['SKILL.md', 'reference/brand.md', 'reference/voice.md', ...Object.keys(f.design), ...f.include];
    return { id: s.id, title: s.title, blurb: s.blurb, shown: skillShown(settings, s.id), md: f.md.slice(0, 20_000), reference: f.reference.slice(0, 6000), files: list, checks };
  });
  return NextResponse.json({ skills, hidden: !!settings.hidden });
}

const Body = z.object({ hidden: z.boolean().optional(), skill: z.string().max(40).optional(), shown: z.boolean().optional() });
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'downloads'); if (gate) return gate; }
  const b = Body.safeParse(await req.json().catch(() => null)); if (!b.success) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('content').eq('id', id).single();
  const c = (p?.content || {}) as Record<string, unknown>;
  const cur = readSkillSettings(c);
  const next = { ...cur };
  if (b.data.hidden !== undefined) next.hidden = b.data.hidden;
  if (b.data.skill && b.data.shown !== undefined) next.off = b.data.shown ? (cur.off || []).filter((x) => x !== b.data.skill) : [...new Set([...(cur.off || []), b.data.skill])];
  const { error } = await sb.from('projects').update({ content: { ...c, skills: next } }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, settings: next });
}
