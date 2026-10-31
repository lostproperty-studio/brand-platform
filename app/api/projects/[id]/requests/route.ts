import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';

// Studio: update a client request's status and reply (the client sees both in their Settings).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  const b = z.object({ requestId: z.string().uuid(), status: z.enum(['open', 'in_progress', 'done', 'declined']).optional(), reply: z.string().max(4000).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { requestId, ...patch } = b.data;
  await adminClient().from('requests').update(patch).eq('id', requestId).eq('project_id', id);
  return NextResponse.json({ ok: true });
}
