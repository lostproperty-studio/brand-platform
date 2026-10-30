import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';
import { inviteMember, listMembers } from '@/lib/team';

// The client team for one project. Client admins (and the studio) can invite, change roles and remove people.
async function guard(slug: string) {
  const p = await projectBySlug(slug);
  if (!p) return { res: new Response('Not found', { status: 404 }) };
  const acc = await requireProjectAccess(p.id);
  if (acc instanceof Response) return { res: acc };
  if (!acc.clientAdmin) return { res: new Response('Only admins can manage the team', { status: 403 }) };
  return { p, acc };
}

export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const g = await guard((await ctx.params).slug); if (g.res) return g.res;
  return NextResponse.json({ members: await listMembers(g.p!.id), me: g.acc!.user.id });
}

const Invite = z.object({ email: z.string().email().max(200), role: z.enum(['client_admin', 'client_viewer']).default('client_viewer') });
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const g = await guard(slug); if (g.res) return g.res;
  const b = Invite.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  try {
    const r = await inviteMember(g.p!.id, slug, b.data.email, b.data.role, g.acc!.user.id);
    return NextResponse.json({ ok: true, emailed: r.emailed, members: await listMembers(g.p!.id) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

const Change = z.object({ userId: z.string().uuid(), role: z.enum(['client_admin', 'client_viewer']) });
export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const g = await guard((await ctx.params).slug); if (g.res) return g.res;
  const b = Change.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  await adminClient().from('project_members').update({ role: b.data.role }).eq('project_id', g.p!.id).eq('user_id', b.data.userId);
  return NextResponse.json({ members: await listMembers(g.p!.id) });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const g = await guard((await ctx.params).slug); if (g.res) return g.res;
  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  if (userId === g.acc!.user.id && !g.acc!.staff) return NextResponse.json({ error: 'You can’t remove yourself. Ask another admin.' }, { status: 400 });
  await adminClient().from('project_members').delete().eq('project_id', g.p!.id).eq('user_id', userId);
  return NextResponse.json({ members: await listMembers(g.p!.id) });
}
