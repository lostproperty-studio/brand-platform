import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';

const Body = z.object({ client: z.string().max(120).optional(), name: z.string().max(120).optional(), line: z.string().max(300).optional(), status: z.enum(['draft', 'live', 'archived']).optional(), brand: z.record(z.unknown()).optional(), content: z.record(z.unknown()).optional(), kit_version: z.string().max(20).optional() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { error } = await adminClient().from('projects').update(b.data).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
