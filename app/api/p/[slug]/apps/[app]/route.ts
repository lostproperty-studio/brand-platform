import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appAccess, db, listFiles } from '@/lib/apps/server';

export const runtime = 'nodejs';

// Portal v2: one app's files (Writer docs, Director projects…), newest first, and making a new one
export async function GET(_: Request, ctx: { params: Promise<{ slug: string; app: string }> }) {
  const { slug, app } = await ctx.params;
  const a = await appAccess(slug, app); if (!a) return new Response('Not found', { status: 404 });
  return NextResponse.json(await listFiles(a.p.id, a.app));
}

const Create = z.object({ title: z.string().trim().min(1).max(160).default('Untitled'), data: z.record(z.unknown()).default({}) });
export async function POST(req: Request, ctx: { params: Promise<{ slug: string; app: string }> }) {
  const { slug, app } = await ctx.params;
  const a = await appAccess(slug, app); if (!a) return new Response('Not found', { status: 404 });
  const b = Create.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Give it a name.' }, { status: 400 });
  const { data, error } = await db().from('app_files').insert({ project_id: a.p.id, app: a.app, title: b.data.title, data: b.data.data, created_by: a.acc.user.id, updated_by: a.acc.user.id }).select('id').single();
  if (error) return NextResponse.json({ error: 'Couldn’t create it: ' + error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
