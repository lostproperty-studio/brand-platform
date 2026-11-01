import { teamGate } from '@/lib/studioTeam';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';

// Studio: how this client's sign-in page looks.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'login screen'); if (gate) return gate; }
  const b = z.object({ style: z.enum(['client', 'lp']), background: z.enum(['light', 'dark', 'brand']), message: z.string().max(240) }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('content').eq('id', id).single();
  await sb.from('projects').update({ content: { ...((p?.content as object) || {}), login: b.data } }).eq('id', id);
  return NextResponse.json({ ok: true });
}
