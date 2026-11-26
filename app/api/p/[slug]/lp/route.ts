import { NextResponse } from 'next/server';
import { allow, tooMany } from '@/lib/rateLimit';
import { z } from 'zod';
import { appOrigin } from '@/lib/origin';
import { startThread, supportAccess, threads } from '@/lib/lp/support';

// Conversations with Lost Property: the list (people see their own; admins see everyone's), and starting one
export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const a = await supportAccess((await ctx.params).slug); if (!a) return new Response('Not found', { status: 404 });
  return NextResponse.json({ threads: await threads(a).catch(() => []), all: a.all });
}

const Start = z.object({ kind: z.enum(['chat', 'edit', 'asset', 'feedback', 'session', 'other']).default('chat'), title: z.string().max(140).optional(), body: z.string().trim().min(1).max(4000) });
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const a = await supportAccess((await ctx.params).slug); if (!a) return new Response('Not found', { status: 404 });
  if (!(await allow(`lp:user:${a.acc.user.id}`, 60, 3600))) return tooMany();
  const b = Start.safeParse(await req.json().catch(() => ({}))); if (!b.success) return new Response('Write a message first.', { status: 400 });
  const title = (b.data.title || b.data.body.split('\n')[0]).slice(0, 90);
  try { return NextResponse.json({ id: await startThread(a, { kind: b.data.kind, title, body: b.data.body, origin: await appOrigin() }) }); }
  catch (e) { return new Response((e as Error).message, { status: 503 }); }
}
