import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { teamGate, teamRole, teamRows } from '@/lib/studioTeam';

// The studio team on a project: who has access, and as lead, editor or viewer. Leads (and studio admins) change it.
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'viewer'); if (gate) return gate; }
  const rows = await teamRows(id);
  const { data: staff } = await adminClient().from('staff').select('user_id, email, name, role').order('email');
  return NextResponse.json({ rows, staff: staff || [], me: { id: st.user.id, email: st.user.email, role: await teamRole(id, st, rows), admin: st.role === 'admin' } });
}

const Body = z.object({ members: z.array(z.object({ email: z.string().email().max(200), role: z.enum(['lead', 'editor', 'viewer']) })).max(60) });
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  // Leads manage the team; while a project is open to the whole studio, any editor can set it up
  { const open = !(await teamRows(id)).length; const gate = await teamGate(id, st, open ? 'editor' : 'lead', 'team'); if (gate) return gate; }
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const members = [...new Map(b.data.members.map((m) => [m.email.trim().toLowerCase(), { ...m, email: m.email.trim().toLowerCase() }])).values()];
  const outside = members.filter((m) => !env.studioDomains().includes(m.email.split('@')[1]));
  if (outside.length) return NextResponse.json({ error: `Only studio emails can be on the team: ${outside.map((m) => m.email).join(', ')}. Clients are added on the Client tab.` }, { status: 400 });
  if (members.length && !members.some((m) => m.role === 'lead')) return NextResponse.json({ error: 'Keep at least one lead, so someone can manage the team.' }, { status: 400 });
  const sb = adminClient();
  const { data: staff } = await sb.from('staff').select('user_id, email');
  const uid = new Map((staff || []).map((s) => [String(s.email).toLowerCase(), s.user_id as string]));
  const { error: de } = await sb.from('project_team').delete().eq('project_id', id);
  if (de) return NextResponse.json({ error: 'The team couldn’t be saved. The database may still be updating; try again in a minute.' }, { status: 500 });
  if (members.length) {
    const { error } = await sb.from('project_team').insert(members.map((m) => ({ project_id: id, email: m.email, user_id: uid.get(m.email) || null, role: m.role, added_by: st.user.id })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: await teamRows(id) });
}
