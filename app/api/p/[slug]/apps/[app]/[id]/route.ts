import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appAccess, db } from '@/lib/apps/server';

export const runtime = 'nodejs';
type P = { params: Promise<{ slug: string; app: string; id: string }> };

// Portal v2: one file in an app. Open it, save it (title, status, contents), or delete it.
export async function GET(_: Request, ctx: P) {
  const { slug, app, id } = await ctx.params;
  const a = await appAccess(slug, app); if (!a) return new Response('Not found', { status: 404 });
  const { data } = await db().from('app_files').select('id, title, status, data, updated_at, created_at, created_by').eq('id', id).eq('project_id', a.p.id).eq('app', a.app).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ file: data });
}

const Save = z.object({ title: z.string().trim().min(1).max(160).optional(), status: z.enum(['draft', 'review', 'signed']).optional(), data: z.record(z.unknown()).optional() });
export async function PATCH(req: Request, ctx: P) {
  const { slug, app, id } = await ctx.params;
  const a = await appAccess(slug, app); if (!a) return new Response('Not found', { status: 404 });
  const b = Save.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  if (JSON.stringify(b.data.data || {}).length > 2_000_000) return NextResponse.json({ error: 'This file is too big to save.' }, { status: 413 });
  const { data, error } = await db().from('app_files').update({ ...b.data, updated_by: a.acc.user.id, updated_at: new Date().toISOString() }).eq('id', id).eq('project_id', a.p.id).eq('app', a.app).select('updated_at').maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Couldn’t save: ' + (error?.message || 'not found') }, { status: 500 });
  return NextResponse.json({ ok: true, updated_at: data.updated_at });
}

export async function DELETE(_: Request, ctx: P) {
  const { slug, app, id } = await ctx.params;
  const a = await appAccess(slug, app); if (!a) return new Response('Not found', { status: 404 });
  await db().from('app_files').delete().eq('id', id).eq('project_id', a.p.id).eq('app', a.app);
  return NextResponse.json({ ok: true });
}
