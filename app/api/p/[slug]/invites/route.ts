import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';
import { canGrant, createInviteLink, listInviteLinks } from '@/lib/team';

// Shareable invite links with a role (managers and admins). The link is shown once; only its hash is stored.
async function guard(slug: string) {
  const p = await projectBySlug(slug); if (!p) return { res: new Response('Not found', { status: 404 }) };
  const acc = await requireProjectAccess(p.id); if (acc instanceof Response) return { res: acc };
  if (!acc.canManage) return { res: new Response('Only managers and admins can create invite links', { status: 403 }) };
  return { p, acc };
}

export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const g = await guard((await ctx.params).slug); if (g.res) return g.res;
  return NextResponse.json({ links: await listInviteLinks(g.p!.id) });
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const g = await guard((await ctx.params).slug); if (g.res) return g.res;
  const b = z.object({ role: z.enum(['creator', 'manager', 'admin']), label: z.string().max(80).optional(), days: z.number().int().min(1).max(365).optional(), maxUses: z.number().int().min(1).max(500).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  if (!canGrant(g.acc!.role, b.data.role)) return NextResponse.json({ error: 'Only admins can create admin links.' }, { status: 403 });
  const url = await createInviteLink(g.p!.id, b.data.role, g.acc!.user.id, b.data);
  return NextResponse.json({ url, links: await listInviteLinks(g.p!.id) });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const g = await guard((await ctx.params).slug); if (g.res) return g.res;
  const id = new URL(req.url).searchParams.get('id');
  if (id) await adminClient().from('invite_links').update({ revoked: true }).eq('id', id).eq('project_id', g.p!.id);
  return NextResponse.json({ links: await listInviteLinks(g.p!.id) });
}
