import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';

// Each person's saved work in the tools. Only they can see their own.
async function who(slug: string) {
  const p = await projectBySlug(slug); if (!p) return null;
  const acc = await requireProjectAccess(p.id); if (acc instanceof Response) return null;
  return { p, acc };
}

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const w = await who((await ctx.params).slug); if (!w) return new Response('Not found', { status: 404 });
  const tool = new URL(req.url).searchParams.get('tool');
  let q = adminClient().from('creations').select('id, title, tool_id, data, updated_at').eq('project_id', w.p.id).eq('user_id', w.acc.user.id).order('updated_at', { ascending: false }).limit(50);
  if (tool) q = q.eq('tool_id', tool);
  const { data } = await q;
  return NextResponse.json({ creations: data || [] });
}

const Save = z.object({ id: z.string().uuid().optional(), toolId: z.string().uuid(), title: z.string().min(1).max(120), data: z.record(z.unknown()) });
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const w = await who((await ctx.params).slug); if (!w) return new Response('Not found', { status: 404 });
  const b = Save.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  if (JSON.stringify(b.data.data).length > 900_000) return NextResponse.json({ error: 'That’s too big to save. Remove uploaded images and try again.' }, { status: 400 });
  const sb = adminClient();
  if (b.data.id) {
    const { data } = await sb.from('creations').update({ title: b.data.title, data: b.data.data }).eq('id', b.data.id).eq('user_id', w.acc.user.id).select('id').maybeSingle();
    if (data) return NextResponse.json({ id: data.id });
  }
  const { data, error } = await sb.from('creations').insert({ project_id: w.p.id, user_id: w.acc.user.id, tool_id: b.data.toolId, title: b.data.title, data: b.data.data }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
