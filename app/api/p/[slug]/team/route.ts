import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireProjectAccess, ROLE_OF } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';
import { addMember, canGrant, inviteMember, listMembers } from '@/lib/team';

// The client team. Managers can invite and manage creators and managers; admins (and the studio) can manage everyone.
async function guard(slug: string) {
  const p = await projectBySlug(slug);
  if (!p) return { res: new Response('Not found', { status: 404 }) };
  const acc = await requireProjectAccess(p.id);
  if (acc instanceof Response) return { res: acc };
  if (!acc.canManage) return { res: new Response('Only managers and admins can manage the team', { status: 403 }) };
  return { p, acc };
}
const Role = z.enum(['creator', 'manager', 'admin']);

export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const g = await guard((await ctx.params).slug); if (g.res) return g.res;
  return NextResponse.json({ members: await listMembers(g.p!.id), me: g.acc!.user.id, myRole: g.acc!.role });
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const g = await guard(slug); if (g.res) return g.res;
  const b = z.object({ email: z.string().email().max(200), role: Role.default('creator') }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (!canGrant(g.acc!.role, b.data.role)) return NextResponse.json({ error: 'Only admins can invite admins.' }, { status: 403 });
  try {
    const r = await inviteMember(g.p!.id, slug, b.data.email, b.data.role, g.acc!.user.id);
    return NextResponse.json({ ok: true, emailed: r.emailed, members: await listMembers(g.p!.id) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

async function targetRole(projectId: string, userId: string) {
  const { data } = await adminClient().from('project_members').select('role').eq('project_id', projectId).eq('user_id', userId).maybeSingle();
  return data ? ROLE_OF[data.role as string] : null;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const g = await guard((await ctx.params).slug); if (g.res) return g.res;
  const b = z.object({ userId: z.string().uuid(), role: Role }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const current = await targetRole(g.p!.id, b.data.userId);
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canGrant(g.acc!.role, b.data.role) || !canGrant(g.acc!.role, current)) return NextResponse.json({ error: 'Only admins can change admins.' }, { status: 403 });
  if (b.data.userId === g.acc!.user.id && !g.acc!.staff) return NextResponse.json({ error: 'You can’t change your own role. Ask another admin.' }, { status: 400 });
  await adminClient().from('project_members').update({ role: { admin: 'client_admin', manager: 'client_manager', creator: 'client_viewer' }[b.data.role] }).eq('project_id', g.p!.id).eq('user_id', b.data.userId);
  return NextResponse.json({ members: await listMembers(g.p!.id) });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const g = await guard((await ctx.params).slug); if (g.res) return g.res;
  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  if (userId === g.acc!.user.id && !g.acc!.staff) return NextResponse.json({ error: 'You can’t remove yourself. Ask another admin.' }, { status: 400 });
  const current = await targetRole(g.p!.id, userId);
  if (current && !canGrant(g.acc!.role, current)) return NextResponse.json({ error: 'Only admins can remove admins.' }, { status: 403 });
  await adminClient().from('project_members').delete().eq('project_id', g.p!.id).eq('user_id', userId);
  return NextResponse.json({ members: await listMembers(g.p!.id) });
}
