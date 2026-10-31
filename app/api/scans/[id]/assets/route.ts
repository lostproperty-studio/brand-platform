import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { exportNodes, fetchPage } from '@/lib/figma/scan';
import { suggestName } from '@/lib/review/names';

type N = { id: string; name: string; children?: N[] };

// Adds a Figma layer as a final, downloadable asset (by layer id, or a Figma link to it).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  const b = z.object({ nodeId: z.string().max(40).optional(), link: z.string().max(600).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const nodeId = b.data.nodeId || b.data.link?.match(/node-id=([0-9]+[-:][0-9]+)/)?.[1]?.replace('-', ':');
  if (!nodeId) return NextResponse.json({ error: 'Paste a Figma link to the layer (right-click it in Figma, then Copy link to selection).' }, { status: 400 });
  const sb = adminClient();
  const { data: scan } = await sb.from('scans').select('project_id, figma_key, page_id').eq('id', id).single();
  if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { root } = await fetchPage(scan.figma_key, scan.page_id);
  let layer: N | null = null;
  const walk = (n: N) => { if (layer) return; if (n.id === nodeId) { layer = n; return; } (n.children || []).forEach(walk); };
  walk(root as unknown as N);
  if (!layer) return NextResponse.json({ error: 'That layer isn’t on the guidelines page this project scans.' }, { status: 400 });
  const found = layer as N;
  const { data: dup } = await sb.from('review_items').select('id').eq('scan_id', id).eq('node_id', nodeId).maybeSingle();
  if (dup) { await sb.from('review_items').update({ status: 'accepted' }).eq('id', dup.id); return NextResponse.json({ ok: true, id: dup.id }); }
  const { data: p } = await sb.from('projects').select('client').eq('id', scan.project_id).single();
  const urls = await exportNodes(scan.figma_key, [nodeId], 'png', 1);
  let preview: string | null = null;
  if (urls[nodeId]) {
    const path = `${scan.project_id}/${id}/${nodeId.replace(/[:;]/g, '-')}.png`;
    const { error } = await sb.storage.from('previews').upload(path, new Uint8Array(await (await fetch(urls[nodeId]!)).arrayBuffer()), { contentType: 'image/png', upsert: true });
    if (!error) preview = path;
  }
  const { data: last } = await sb.from('review_items').select('ord').eq('scan_id', id).order('ord', { ascending: false }).limit(1).maybeSingle();
  const name = suggestName(p?.client || 'brand', found.name);
  const { data: item, error } = await sb.from('review_items').insert({ scan_id: id, ord: (last?.ord ?? 0) + 1, chapter: 'logo', kind: 'asset', title: found.name, found: 'Added by the studio from Figma.', proposal: name, input: 'confirm', node_id: nodeId, preview_path: preview, status: 'accepted', answer: name, note: 'Added in the review' }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Make sure it's in the assets section
  const { data: s2 } = await sb.from('scans').select('meta').eq('id', id).single();
  const meta = (s2?.meta || {}) as { questions?: Record<string, unknown> };
  await sb.from('scans').update({ meta: { ...meta, questions: { ...(meta.questions || {}), [item.id]: { section: 'assets', question: `Is “${found.name}” final artwork to download?`, priority: 1 } } } }).eq('id', id);
  return NextResponse.json({ ok: true, item: { ...item, preview: preview ? (await sb.storage.from('previews').createSignedUrl(preview, 3600)).data?.signedUrl ?? null : null } });
}
