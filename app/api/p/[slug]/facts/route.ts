import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';
import { nameOf } from '@/lib/guideVersions';
import { addFact, readFacts } from '@/lib/factSheet';
import { canSee, projectStages } from '@/lib/features';

// The fact sheet the Writer works from. Everyone in the portal can read it; managers, admins and the studio edit it.
async function load(slug: string) {
  const p = await projectBySlug(slug); if (!p) return null;
  const acc = await requireProjectAccess(p.id); if (acc instanceof Response) return null;
  if (!canSee((await projectStages(p.id)).facts, acc.staff)) return null;
  return { p, acc, canEdit: acc.canManage || acc.staff };
}

export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const a = await load((await ctx.params).slug); if (!a) return new Response('Not found', { status: 404 });
  const { data } = await adminClient().from('projects').select('content').eq('id', a.p.id).single();
  return NextResponse.json({ facts: readFacts(data?.content), canEdit: a.canEdit }, { headers: { 'Cache-Control': 'no-store' } });
}

const Tab = z.object({ id: z.string().max(40), title: z.string().max(60), about: z.string().max(200).default(''), columns: z.array(z.string().max(60)).min(1).max(8), rows: z.array(z.array(z.string().max(500)).max(8)).max(300) });
const Body = z.object({ facts: z.object({ owner: z.string().max(80).default(''), tabs: z.array(Tab).min(1).max(20) }), base: z.string().optional() });

export async function PUT(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const a = await load((await ctx.params).slug); if (!a) return new Response('Not found', { status: 404 });
  if (!a.canEdit) return new Response('Only managers and admins can change the fact sheet.', { status: 403 });
  const b = Body.safeParse(await req.json().catch(() => ({}))); if (!b.success) return new Response('Bad request', { status: 400 });
  const sb = adminClient();
  const { data } = await sb.from('projects').select('content').eq('id', a.p.id).single();
  const content = (data?.content || {}) as Record<string, unknown>;
  const cur = readFacts(content);
  // Someone else saved since this copy was opened: hand theirs back rather than overwrite it
  if (b.data.base && cur.updatedAt && cur.updatedAt !== b.data.base) return NextResponse.json({ conflict: true, facts: cur }, { status: 409 });
  const facts = { ...b.data.facts, updatedAt: new Date().toISOString(), updatedBy: nameOf(a.acc.user as Parameters<typeof nameOf>[0]) };
  await sb.from('projects').update({ content: { ...content, factSheet: facts } }).eq('id', a.p.id);
  return NextResponse.json({ facts: readFacts({ factSheet: facts }) });
}

// One fact, added while writing (the Writer spotted it). Managers and admins add it as confirmed; anyone else's goes
// in as a question for them to confirm, so nothing unchecked reaches the Writer.
const One = z.object({ label: z.string().min(1).max(120), value: z.string().min(1).max(500), tab: z.string().max(40).optional() });
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const a = await load((await ctx.params).slug); if (!a) return new Response('Not found', { status: 404 });
  const b = One.safeParse(await req.json().catch(() => ({}))); if (!b.success) return new Response('Bad request', { status: 400 });
  const sb = adminClient();
  const { data } = await sb.from('projects').select('content').eq('id', a.p.id).single();
  const content = (data?.content || {}) as Record<string, unknown>;
  const who = nameOf(a.acc.user as Parameters<typeof nameOf>[0]);
  const cur = readFacts(content);
  const next = addFact(cur, { ...b.data, note: a.canEdit ? undefined : `Check: added from the Writer by ${who}` });
  const facts = { owner: cur.owner, tabs: next.tabs, updatedAt: new Date().toISOString(), updatedBy: who };
  await sb.from('projects').update({ content: { ...content, factSheet: facts } }).eq('id', a.p.id);
  return NextResponse.json({ facts: readFacts({ factSheet: facts }), confirmed: a.canEdit });
}
