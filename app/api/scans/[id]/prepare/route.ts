import { NextResponse } from 'next/server';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { prepareReview } from '@/lib/review/prepare';

export const maxDuration = 120;

// Plain questions + Figma context for each review item, with signed image links.
export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  try {
    const { questions, contexts } = await prepareReview(id);
    const { data: items } = await adminClient().from('review_items').select('*').eq('scan_id', id).order('ord');
    const withPrev = await Promise.all((items || []).map(async (it) => ({ ...it, preview: it.preview_path ? (await adminClient().storage.from('previews').createSignedUrl(it.preview_path, 3600)).data?.signedUrl ?? null : null })));
    const frames = [...new Set(Object.values(contexts).map((c) => c.frame))];
    const { data } = frames.length ? await adminClient().storage.from('previews').createSignedUrls(frames, 3600) : { data: [] };
    const urls = Object.fromEntries((data || []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl]));
    const { data: sc } = await adminClient().from('scans').select('projects(client)').eq('id', id).single();
    return NextResponse.json({ questions, contexts, urls, items: withPrev, client: (sc?.projects as unknown as { client: string } | null)?.client || '' });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
