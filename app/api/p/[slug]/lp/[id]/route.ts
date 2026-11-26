import { NextResponse } from 'next/server';
import { allow, tooMany } from '@/lib/rateLimit';
import { z } from 'zod';
import { appOrigin } from '@/lib/origin';
import { reply, supportAccess, thread } from '@/lib/lp/support';

// One conversation with Lost Property: read it, or add to it
export async function GET(_: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  const a = await supportAccess(slug); if (!a) return new Response('Not found', { status: 404 });
  const t = await thread(a, id); if (!t) return new Response('Not found', { status: 404 });
  return NextResponse.json(t, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(req: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  const a = await supportAccess(slug); if (!a) return new Response('Not found', { status: 404 });
  if (!(await allow(`lp:user:${a.acc.user.id}`, 60, 3600))) return tooMany();
  const b = z.object({ body: z.string().trim().min(1).max(4000) }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return new Response('Write a message first.', { status: 400 });
  if (!(await reply(a, id, b.data.body, await appOrigin()))) return new Response('Not found', { status: 404 });
  return NextResponse.json(await thread(a, id));
}
