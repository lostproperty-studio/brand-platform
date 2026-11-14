import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, directorAccess, signDoc, stripDoc, thumbOf } from '@/lib/director/server';
import { isAspect, type Doc } from '@/lib/director/model';

export const runtime = 'nodejs';
type P = { params: Promise<{ slug: string; fid: string }> };

// One Director file: open it (with fresh media links), save the edit, or delete it
export async function GET(_: Request, ctx: P) {
  const { slug, fid } = await ctx.params;
  const a = await directorAccess(slug); if (!a) return new Response('Not found', { status: 404 });
  const { data } = await db().from('director_files').select('id, title, aspect, status, data, thumb, updated_at').eq('project_id', a.p.id).eq('id', fid).maybeSingle();
  if (!data) return NextResponse.json({ error: 'That video has gone.' }, { status: 404 });
  return NextResponse.json({ file: { ...data, data: await signDoc(a.p.id, data.data as Doc) } });
}

const Save = z.object({ title: z.string().min(1).max(120), aspect: z.string().refine(isAspect), status: z.enum(['plan', 'edit']), data: z.record(z.unknown()) });
export async function PUT(req: Request, ctx: P) {
  const { slug, fid } = await ctx.params;
  const a = await directorAccess(slug); if (!a) return new Response('Not found', { status: 404 });
  const b = Save.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const doc = stripDoc(b.data.data as Doc);
  if (JSON.stringify(doc).length > 800_000) return NextResponse.json({ error: 'This edit is too big to save.' }, { status: 400 });
  const { error } = await db().from('director_files').update({ title: b.data.title, aspect: b.data.aspect, status: b.data.status, data: doc, thumb: thumbOf(doc), updated_at: new Date().toISOString() }).eq('project_id', a.p.id).eq('id', fid);
  if (error) return NextResponse.json({ error: 'Couldn’t save: ' + error.message }, { status: 500 });
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}

export async function DELETE(_: Request, ctx: P) {
  const { slug, fid } = await ctx.params;
  const a = await directorAccess(slug); if (!a) return new Response('Not found', { status: 404 });
  await db().from('director_files').delete().eq('project_id', a.p.id).eq('id', fid);
  return NextResponse.json({ ok: true });
}
