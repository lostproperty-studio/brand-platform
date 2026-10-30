import { NextResponse } from 'next/server';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';

export async function DELETE(_: Request, ctx: { params: Promise<{ slug: string; cid: string }> }) {
  const { slug, cid } = await ctx.params;
  const p = await projectBySlug(slug); if (!p) return new Response('Not found', { status: 404 });
  const acc = await requireProjectAccess(p.id); if (acc instanceof Response) return acc;
  await adminClient().from('creations').delete().eq('id', cid).eq('user_id', acc.user.id);
  return NextResponse.json({ ok: true });
}
