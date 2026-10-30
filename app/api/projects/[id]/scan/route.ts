import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { exportNodes, scanFigmaPage } from '@/lib/figma/scan';
import { buildReview } from '@/lib/scan/review';

export const maxDuration = 300;

// Scans the project's Figma page and writes review items. The wizard polls the scan row for step progress.
export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { user } = st;
  const { id } = await ctx.params;
  const sb = adminClient();
  const { data: p, error } = await sb.from('projects').select('client, figma_key, figma_page_id').eq('id', id).single();
  if (error || !p?.figma_key) return NextResponse.json({ error: 'Link a Figma file first.' }, { status: 400 });

  const steps = ['Read the page', 'Read the text', 'Read colours and type', 'Find the assets', 'Check for gaps'].map((title) => ({ title, desc: '', state: 'waiting' }));
  const { data: scan } = await sb.from('scans').insert({ project_id: id, figma_key: p.figma_key, page_id: p.figma_page_id, status: 'running', steps, created_by: user.id }).select('id').single();
  const step = async (i: number, desc: string) => { steps.forEach((s, j) => { s.state = j < i ? 'done' : j === i ? 'running' : 'waiting'; }); steps[i].desc = desc; await sb.from('scans').update({ steps }).eq('id', scan!.id); };

  after(async () => { try {
    await step(0, 'Opening the file');
    const result = await scanFigmaPage(p.figma_key, p.figma_page_id);
    await step(1, `${result.stats.frames} frames on “${result.pageName}”, grouped into ${result.chapters.length} chapters`);
    await step(2, `${result.stats.texts} text layers read`);
    await step(3, `${result.colours.length} colours and ${result.type.length} type settings; ${result.styles.length ? result.styles.length + ' styles' : 'no styles in the file'}`);
    const previews = await exportNodes(p.figma_key, result.assets.slice(0, 40).map((a) => a.id), 'png', 1);
    const previewPaths: Record<string, string> = {};
    for (const [nodeId, url] of Object.entries(previews)) {
      if (!url) continue;
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      const path = `${id}/${scan!.id}/${nodeId.replace(':', '-')}.png`;
      await sb.storage.from('previews').upload(path, bytes, { contentType: 'image/png', upsert: true });
      previewPaths[nodeId] = path;
    }
    await step(4, `${result.assets.length} named asset layers found`);
    const items = await buildReview(result, p.client);
    await sb.from('review_items').insert(items.map((it, ord) => ({ ...it, scan_id: scan!.id, ord, preview_path: it.node_id ? previewPaths[it.node_id] ?? null : null })));
    steps.forEach((s) => { s.state = 'done'; }); steps[4].desc = `${items.length} items to review`;
    await sb.from('scans').update({ status: 'done', steps, finished_at: new Date().toISOString(), meta: { file: result.fileName, page: result.pageName, chapters: result.chapters.map((c) => ({ id: c.id, title: c.title })), colours: result.colours.slice(0, 12), type: result.type.slice(0, 12) } }).eq('id', scan!.id);
  } catch (e) {
    await sb.from('scans').update({ status: 'failed', error: String((e as Error).message || e).slice(0, 500) }).eq('id', scan!.id);
  } });
  return NextResponse.json({ scanId: scan!.id });
}
