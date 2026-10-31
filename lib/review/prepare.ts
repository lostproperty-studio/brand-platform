import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { exportNodes, fetchPage } from '@/lib/figma/scan';
import { studioAnthropic } from '@/lib/ai/studio';
import { fallbackQuestion, type ItemLike, type ReviewQuestion } from '@/lib/review/questions';

type FNode = { id: string; type: string; absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null; children?: FNode[] };
export type ItemContext = { frame: string; box: { x: number; y: number; w: number; h: number } };

/** Where each item sits on its Figma slide: a small image of the slide and the item's box on it (as %). */
async function buildContexts(projectId: string, scanId: string, figmaKey: string, pageId: string | null, nodeIds: string[]) {
  const { root } = await fetchPage(figmaKey, pageId);
  const top = new Map<string, { frame: FNode; box: NonNullable<FNode['absoluteBoundingBox']> }>();
  for (const f of (root as unknown as FNode).children || []) {
    if (!f.absoluteBoundingBox) continue;
    const walk = (n: FNode) => { if (n.absoluteBoundingBox) top.set(n.id, { frame: f, box: n.absoluteBoundingBox }); (n.children || []).forEach(walk); };
    walk(f);
  }
  const wanted = nodeIds.map((id) => ({ id, hit: top.get(id) })).filter((x) => x.hit) as { id: string; hit: { frame: FNode; box: { x: number; y: number; width: number; height: number } } }[];
  const frames = [...new Set(wanted.map((w) => w.hit.frame.id))];
  const urls = await exportNodes(figmaKey, frames, 'jpg', 0.5);
  const sb = adminClient();
  const paths: Record<string, string> = {};
  await Promise.all(frames.map(async (fid) => {
    const u = urls[fid]; if (!u) return;
    const path = `${projectId}/${scanId}/ctx-${fid.replace(/[:;]/g, '-')}.jpg`;
    const { error } = await sb.storage.from('previews').upload(path, new Uint8Array(await (await fetch(u)).arrayBuffer()), { contentType: 'image/jpeg', upsert: true });
    if (!error) paths[fid] = path;
  }));
  const out: Record<string, ItemContext> = {};
  for (const w of wanted) {
    const fb = w.hit.frame.absoluteBoundingBox!, b = w.hit.box;
    if (!paths[w.hit.frame.id]) continue;
    const pct = (v: number, of: number) => Math.max(0, Math.min(100, Math.round((v / of) * 1000) / 10));
    out[w.id] = { frame: paths[w.hit.frame.id], box: { x: pct(b.x - fb.x, fb.width), y: pct(b.y - fb.y, fb.height), w: pct(b.width, fb.width), h: pct(b.height, fb.height) } };
  }
  return out;
}

const Q = z.object({ id: z.string(), question: z.string(), why: z.string().optional(), yes: z.string().optional(), no: z.string().optional(), noNeedsDetail: z.boolean().optional(), priority: z.number().int().min(1).max(3) });

/** Claude rewrites each item as one plain question with what happens on yes and on no, and ranks them. */
async function writeQuestions(client: string, items: ItemLike[]): Promise<Record<string, ReviewQuestion>> {
  const res = await studioAnthropic().messages.create({
    model: 'claude-sonnet-5-5', max_tokens: 12000,
    system: `You help a brand designer finish a brand guidelines handover for ${client}. Turn each review item into ONE plain question they can answer quickly.
- question: under 18 words, everyday language, no jargon, answerable with yes or no where at all possible (e.g. "Is this the master logo artwork, or just an illustration?"). For choice items ask which option is right.
- why: one short line on what you found that made you ask.
- yes: what you'll do if they say yes, first person, under 20 words (e.g. "I'll save it as a downloadable asset, as SVG and PNG.").
- no: what you'll do if they say no, under 20 words. If a no needs them to tell you the right answer, leave "no" empty and set noNeedsDetail true.
- priority: 1 = blocks the kit or could be wrong in front of the client (logo artwork, conflicts, missing key values); 2 = improves the rules; 3 = minor confirmation they could accept in bulk. Be strict: most items should be 2 or 3.
Call save_questions once with every item id.`,
    tools: [{ name: 'save_questions', description: 'Save the questions.', input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, question: { type: 'string' }, why: { type: 'string' }, yes: { type: 'string' }, no: { type: 'string' }, noNeedsDetail: { type: 'boolean' }, priority: { type: 'integer', enum: [1, 2, 3] } }, required: ['id', 'question', 'priority'] } } }, required: ['items'] } }],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: JSON.stringify(items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, found: i.found, proposal: i.proposal, input: i.input, options: i.options, recommend: i.recommend }))) }]
  });
  const call = res.content.find((b) => b.type === 'tool_use');
  const parsed = call && call.type === 'tool_use' ? z.object({ items: z.array(Q) }).safeParse(call.input) : null;
  if (!parsed?.success) return {};
  return Object.fromEntries(parsed.data.items.map((q) => [q.id, { question: q.question, why: q.why, yes: q.yes || undefined, no: q.no || undefined, noNeedsDetail: q.noNeedsDetail, priority: q.priority as 1 | 2 | 3 }]));
}

/** Makes sure a scan has its plain questions and Figma context images. Runs once per scan; safe to call again. */
export async function prepareReview(scanId: string) {
  const sb = adminClient();
  const { data: scan } = await sb.from('scans').select('id, project_id, figma_key, page_id, meta').eq('id', scanId).single();
  if (!scan) throw new Error('Scan not found');
  const meta = (scan.meta || {}) as { questions?: Record<string, ReviewQuestion>; contexts?: Record<string, ItemContext> };
  const { data: items } = await sb.from('review_items').select('id, kind, title, found, proposal, input, options, recommend, node_id').eq('scan_id', scanId).order('ord');
  const list = (items || []) as (ItemLike & { node_id: string | null })[];
  const { data: p } = await sb.from('projects').select('client').eq('id', scan.project_id).single();
  const [questions, contexts] = await Promise.all([
    meta.questions ? Promise.resolve(meta.questions) : writeQuestions(p?.client || 'the client', list).catch(() => ({} as Record<string, ReviewQuestion>)),
    meta.contexts ? Promise.resolve(meta.contexts) : buildContexts(scan.project_id!, scanId, scan.figma_key, scan.page_id, [...new Set(list.map((i) => i.node_id).filter(Boolean) as string[])]).catch(() => ({} as Record<string, ItemContext>))
  ]);
  for (const i of list) if (!questions[i.id]) questions[i.id] = fallbackQuestion(i);
  await sb.from('scans').update({ meta: { ...meta, questions, contexts } }).eq('id', scanId);
  return { questions, contexts };
}
