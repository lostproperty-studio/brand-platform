import { NextResponse } from 'next/server';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';

async function own(slug: string, cid: string) {
  const p = await projectBySlug(slug);
  if (!p) return null;
  const acc = await requireProjectAccess(p.id);
  if (acc instanceof Response) return null;
  const { data } = await adminClient().from('conversations').select('id').eq('id', cid).eq('project_id', p.id).eq('user_id', acc.user.id).maybeSingle();
  return data ? cid : null;
}

export async function GET(_: Request, ctx: { params: Promise<{ slug: string; cid: string }> }) {
  const { slug, cid } = await ctx.params;
  if (!(await own(slug, cid))) return new Response('Not found', { status: 404 });
  const { data } = await adminClient().from('messages').select('role, content, context').eq('conversation_id', cid).order('id');
  return NextResponse.json({ messages: data || [] });
}

export async function DELETE(_: Request, ctx: { params: Promise<{ slug: string; cid: string }> }) {
  const { slug, cid } = await ctx.params;
  if (!(await own(slug, cid))) return new Response('Not found', { status: 404 });
  await adminClient().from('conversations').delete().eq('id', cid);
  return NextResponse.json({ ok: true });
}
