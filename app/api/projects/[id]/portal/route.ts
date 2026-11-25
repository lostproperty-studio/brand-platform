import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { setBetaAccess } from '@/lib/portalVersionServer';

// A client's access to the beta portal: Off, Studio only or Client. Admins only, as it decides what a client sees.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  const b = z.object({ access: z.enum(['off', 'studio', 'client']) }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: 'Choose Off, Studio only or Client.' }, { status: 400 });
  try { await setBetaAccess(id, b.data.access, st.user.id); }
  catch (e) { return NextResponse.json({ error: 'Couldn’t save: ' + (e as Error).message }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
