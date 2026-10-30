import { NextResponse } from 'next/server';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';

// The signed-in person's own Ask conversations on this project.
export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const p = await projectBySlug((await ctx.params).slug);
  if (!p) return new Response('Not found', { status: 404 });
  const acc = await requireProjectAccess(p.id);
  if (acc instanceof Response) return acc;
  const { data } = await adminClient().from('conversations').select('id, title, context, updated_at').eq('project_id', p.id).eq('user_id', acc.user.id).is('tool_id', null).order('updated_at', { ascending: false }).limit(40);
  return NextResponse.json({ conversations: data || [] });
}
