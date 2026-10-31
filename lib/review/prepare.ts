import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { exportNodes, fetchPage, scanFigmaPage } from '@/lib/figma/scan';
import { findStyleMismatches } from '@/lib/review/styling';
import { studioAnthropic } from '@/lib/ai/studio';
import { fallbackQuestion, fallbackSection, type ItemLike, type ReviewQuestion } from '@/lib/review/questions';

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

const Q = z.object({ id: z.string(), section: z.enum(['assets', 'language', 'styling', 'gaps', 'housekeeping']).optional(), question: z.string(), why: z.string().optional(), yes: z.string().optional(), no: z.string().optional(), noNeedsDetail: z.boolean().optional(), priority: z.number().int().min(1).max(3) });

/** Claude rewrites each item as one plain question with what happens on yes and on no, and ranks them. */
async function writeQuestions(client: string, items: ItemLike[]): Promise<Record<string, ReviewQuestion>> {
  const res = await studioAnthropic().messages.create({
    model: 'claude-sonnet-5-5', max_tokens: 12000,
    system: `You help a brand designer finish a brand guidelines handover for ${client}. Turn each review item into ONE plain question they can answer quickly.
- question: under 18 words, everyday language, no jargon, answerable with yes or no where at all possible (e.g. "Is this the master logo artwork, or just an illustration?"). For choice items ask which option is right.
- why: one short line on what you found that made you ask.
- yes: what you'll do if they say yes, first person, under 20 words (e.g. "I'll save it as a downloadable asset, as SVG and PNG.").
- no: what you'll do if they say no, under 20 words. If a no needs them to tell you the right answer, leave "no" empty and set noNeedsDetail true.
- section, one of:
  assets: whether a layer is final artwork that should be downloadable (asset items only).
  language: rules or wording that contradict each other, are vague, or name the same thing differently, so people or AI could misread them.
  styling: values that are mostly consistent but vary (sizes, colours, spacing, line height); ask which is right.
  gaps: rules or numbers the kit needs that the file doesn't give (logo in use: which file, position and scale; minimum sizes; contrast; grid). Strategy and tone of voice are flagged as missing, never proposed.
  housekeeping: placeholder copy, empty frames, trial fonts, file setup.
- priority: 1 = blocks the kit or could be wrong in front of the client (logo artwork, conflicts, missing key values); 2 = improves the rules; 3 = minor confirmation they could accept in bulk. Be strict: most items should be 2 or 3.
Call save_questions once with every item id.`,
    tools: [{ name: 'save_questions', description: 'Save the questions.', input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, section: { type: 'string', enum: ['assets', 'language', 'styling', 'gaps', 'housekeeping'] }, question: { type: 'string' }, why: { type: 'string' }, yes: { type: 'string' }, no: { type: 'string' }, noNeedsDetail: { type: 'boolean' }, priority: { type: 'integer', enum: [1, 2, 3] } }, required: ['id', 'question', 'priority'] } } }, required: ['items'] } }],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: JSON.stringify(items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, found: i.found, proposal: i.proposal, input: i.input, options: i.options, recommend: i.recommend }))) }]
  });
  const call = res.content.find((b) => b.type === 'tool_use');
  const parsed = call && call.type === 'tool_use' ? z.object({ items: z.array(Q) }).safeParse(call.input) : null;
  if (!parsed?.success) return {};
  return Object.fromEntries(parsed.data.items.map((q) => [q.id, { section: q.section, question: q.question, why: q.why, yes: q.yes || undefined, no: q.no || undefined, noNeedsDetail: q.noNeedsDetail, priority: q.priority as 1 | 2 | 3 }]));
}

const VERSION = 2;

/** Adds "which is right?" items for styling that's nearly consistent. Needs the full scan, so it reads Figma again. */
async function addStylingItems(scanId: string, figmaKey: string, pageId: string | null, existing: { title: string }[]) {
  const sb = adminClient();
  const scan = await scanFigmaPage(figmaKey, pageId);
  const issues = findStyleMismatches(scan).filter((x) => !existing.some((e) => e.title === x.title));
  if (!issues.length) return 0;
  const { data: last } = await sb.from('review_items').select('ord').eq('scan_id', scanId).order('ord', { ascending: false }).limit(1).maybeSingle();
  let ord = (last?.ord ?? 0) + 1;
  await sb.from('review_items').insert(issues.map((x) => ({ scan_id: scanId, ord: ord++, chapter: x.chapter, kind: 'conflict', title: x.title, found: x.found, proposal: x.proposal, input: 'choice', options: x.options, recommend: x.recommend, node_id: x.node_id, swatches: x.swatches })));
  return issues.length;
}

/** Makes sure a scan has its plain questions, sections and Figma context images. Runs once per scan; safe to call again. */
export async function prepareReview(scanId: string) {
  const sb = adminClient();
  const { data: scan } = await sb.from('scans').select('id, project_id, figma_key, page_id, meta').eq('id', scanId).single();
  if (!scan) throw new Error('Scan not found');
  const meta = (scan.meta || {}) as { questions?: Record<string, ReviewQuestion>; contexts?: Record<string, ItemContext>; prepVersion?: number };
  const upgrade = (meta.prepVersion || 1) < VERSION;
  const read = async () => ((await sb.from('review_items').select('id, kind, title, found, proposal, input, options, recommend, node_id').eq('scan_id', scanId).order('ord')).data || []) as (ItemLike & { node_id: string | null })[];
  let list = await read();
  if (upgrade || !meta.questions) {
    const added = await addStylingItems(scanId, scan.figma_key, scan.page_id, list).catch(() => 0);
    if (added) list = await read();
  }
  const { data: p } = await sb.from('projects').select('client').eq('id', scan.project_id).single();
  const needQuestions = !meta.questions || upgrade;
  const nodeIds = [...new Set(list.map((i) => i.node_id).filter(Boolean) as string[])];
  const missingCtx = !meta.contexts || nodeIds.some((n) => !meta.contexts![n]);
  const [questions, contexts] = await Promise.all([
    needQuestions ? writeQuestions(p?.client || 'the client', list).then((q) => ({ ...(meta.questions || {}), ...q })).catch(() => meta.questions || ({} as Record<string, ReviewQuestion>)) : Promise.resolve(meta.questions!),
    missingCtx ? buildContexts(scan.project_id!, scanId, scan.figma_key, scan.page_id, nodeIds).then((c) => ({ ...(meta.contexts || {}), ...c })).catch(() => meta.contexts || ({} as Record<string, ItemContext>)) : Promise.resolve(meta.contexts!)
  ]);
  for (const i of list) {
    if (!questions[i.id]) questions[i.id] = fallbackQuestion(i);
    if (!questions[i.id].section) questions[i.id].section = fallbackSection(i);
    if (i.kind === 'asset') questions[i.id].section = 'assets';
  }
  await sb.from('scans').update({ meta: { ...meta, questions, contexts, prepVersion: VERSION } }).eq('id', scanId);
  return { questions, contexts, added: list.length };
}
