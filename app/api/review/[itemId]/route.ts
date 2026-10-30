import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';

const Body = z.object({ status: z.enum(['open', 'accepted', 'changed', 'answered', 'skipped', 'delegated']).optional(), answer: z.string().max(8000).optional(), note: z.string().max(4000).optional() });

export async function PATCH(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { itemId } = await ctx.params;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { data, error } = await adminClient().from('review_items').update({ ...b.data, answered_by: st.user.id }).eq('id', itemId).select('id, status, answer, note').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
