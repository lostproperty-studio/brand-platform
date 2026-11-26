import { NextResponse } from 'next/server';
import { scanGate } from '@/lib/studioTeam';
import { adminClient, requireStaff } from '@/lib/supabase/server';

// Scan progress + review items (with signed preview URLs). The wizard polls this while scanning.
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await scanGate(id, st as Exclude<typeof st, Response>, 'viewer'); if (gate) return gate; }
  const sb = adminClient();
  const { data: scan } = await sb.from('scans').select('id, project_id, figma_key, status, steps, meta, error').eq('id', id).single();
  if (!scan) return new Response('Not found', { status: 404 });
  const { data: items } = scan.status === 'done' ? await sb.from('review_items').select('*').eq('scan_id', id).order('ord') : { data: [] };
  const withPrev = await Promise.all((items || []).map(async (it) => ({ ...it, preview: it.preview_path ? (await sb.storage.from('previews').createSignedUrl(it.preview_path, 3600)).data?.signedUrl ?? null : null })));
  return NextResponse.json({ scan, items: withPrev });
}
