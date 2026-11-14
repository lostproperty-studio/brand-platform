import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, directorAccess, signThumbs, stripDoc, thumbOf } from '@/lib/director/server';
import { emptyDoc, isAspect, type Doc } from '@/lib/director/model';

export const runtime = 'nodejs';

// Director files: the project team's videos, newest first, and making a new one
export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const a = await directorAccess((await ctx.params).slug); if (!a) return new Response('Not found', { status: 404 });
  const { data, error } = await db().from('director_files').select('id, title, aspect, status, thumb, updated_at, data').eq('project_id', a.p.id).order('updated_at', { ascending: false }).limit(200);
  if (error) return NextResponse.json({ files: [], error: 'Director isn’t set up in this database yet.' });
  const urls = await signThumbs(a.p.id, data || []);
  return NextResponse.json({ files: (data || []).map(({ data: d, ...r }) => {
    const doc = d as Doc; const first = doc?.scenes?.find((s) => s.media?.path === r.thumb);
    return { ...r, thumbUrl: r.thumb ? urls[r.thumb] || null : null, thumbKind: first?.media?.kind || null, scenes: doc?.scenes?.length || 0, seconds: (doc?.scenes || []).reduce((t, s) => t + (s.duration || 0), 0), cover: doc?.scenes?.[0]?.background || null };
  }) });
}

const Create = z.object({ title: z.string().min(1).max(120).default('Untitled video'), aspect: z.string().refine(isAspect), data: z.record(z.unknown()).optional() });
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const a = await directorAccess((await ctx.params).slug); if (!a) return new Response('Not found', { status: 404 });
  const b = Create.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Choose a canvas size.' }, { status: 400 });
  const doc = stripDoc((b.data.data as Doc | undefined) || emptyDoc(b.data.aspect as Doc['aspect']));
  const { data, error } = await db().from('director_files').insert({ project_id: a.p.id, created_by: a.acc.user.id, title: b.data.title, aspect: b.data.aspect, status: 'edit', data: doc, thumb: thumbOf(doc) }).select('id').single();
  if (error) return NextResponse.json({ error: 'Couldn’t create the file: ' + error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
