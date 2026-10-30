import { NextResponse } from 'next/server';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { buildSnapshot } from '@/lib/projects/snapshot';

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  const sb = adminClient();
  const snapshot = await buildSnapshot(id);
  const { data: p } = await sb.from('projects').select('kit_version').eq('id', id).single();
  await sb.from('project_versions').insert({ project_id: id, version: p?.kit_version || '1.0.0', snapshot, published_by: st.user.id });
  await sb.from('projects').update({ status: 'live', published_at: new Date().toISOString() }).eq('id', id);
  return NextResponse.json({ ok: true });
}
