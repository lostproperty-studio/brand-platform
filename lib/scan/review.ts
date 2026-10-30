import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { env } from '@/lib/env';
import type { FigmaScan } from '@/lib/figma/scan';

// Turns a Figma scan into review items: things Claude found and will put in the kit, plus gaps it needs a person for.
// Deterministic checks run first (cheap, exact); Claude then drafts measurable rules and questions per chapter.

export const ReviewItem = z.object({
  chapter: z.string(),
  kind: z.enum(['asset', 'value', 'rule', 'conflict', 'issue', 'question']),
  title: z.string(),
  found: z.string(),
  proposal: z.string().default(''),
  input: z.enum(['confirm', 'choice', 'multi', 'text']).default('confirm'),
  options: z.array(z.string()).default([]),
  recommend: z.string().default(''),
  node_id: z.string().nullable().default(null),
  swatches: z.array(z.object({ hex: z.string(), label: z.string() })).default([])
});
export type ReviewItem = z.infer<typeof ReviewItem>;

export const STANDARD_CHAPTERS = [
  ['setup', 'Handover'], ['logo', 'Logo'], ['type', 'Typography'], ['colour', 'Colour'], ['layout', 'Grid & layout'],
  ['imagery', 'Imagery'], ['voice', 'Tone of voice'], ['templates', 'Templates']
] as const;

function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** Exact checks that never need a model. */
export function deterministicItems(scan: FigmaScan): ReviewItem[] {
  const out: ReviewItem[] = [];
  const allText = scan.chapters.flatMap((c) => c.frames.flatMap((f) => f.texts.map((t) => ({ ...t, chapter: c.title }))));
  const fonts = [...new Set(scan.type.map((t) => t.font.replace(/\s+\d+$/, '')))];
  const trial = fonts.filter((f) => /\b(trial|test)\b/i.test(f));
  if (trial.length) out.push(ReviewItem.parse({ chapter: 'setup', kind: 'conflict', title: 'Trial fonts in the file', found: `Text is set in ${trial.join(', ')}. Trial fonts can’t be shipped in the kit.`, proposal: 'Ship licensed font files only if the licence covers the client’s team and suppliers; otherwise link to the foundry and name a fallback.', input: 'choice', options: ['Client holds licences: send the files', 'Client will buy licences: link to the foundry', 'Not sure yet: flag it in the kit'], recommend: 'Not sure yet: flag it in the kit' }));
  const lorem = [...new Set(allText.filter((t) => /lorem ipsum/i.test(t.text)).map((t) => t.frameId))];
  if (lorem.length) out.push(ReviewItem.parse({ chapter: 'setup', kind: 'issue', title: `Placeholder copy on ${lorem.length} frame${lorem.length > 1 ? 's' : ''}`, found: 'Lorem ipsum found on frames ' + lorem.join(', ') + '.', proposal: 'Leave blank and Claude writes these lines from the rules, or paste the intended copy.', input: 'text', node_id: lorem[0] }));
  for (const a of scan.assets) {
    if (a.visibleLayers === 0) out.push(ReviewItem.parse({ chapter: 'logo', kind: 'issue', title: `Empty asset frame: ${a.name}`, found: `“${a.name}” (${a.w} × ${a.h}) has no visible layers, so it exports blank.`, proposal: 'Skip it. Delete it in Figma or say what it should contain.', node_id: a.id }));
  }
  const greys = scan.colours.filter((c) => c.opacity === 100).map((c) => c.hex);
  const lightBg = '#FFFFFF';
  const weak = greys.filter((h) => { const r = contrast(h, lightBg); return r > 1.3 && r < 4.5; }).slice(0, 4);
  if (weak.length) out.push(ReviewItem.parse({ chapter: 'colour', kind: 'rule', title: 'Which colours can carry text', found: weak.map((h) => `${h} on white: ${contrast(h, lightBg).toFixed(2)} : 1`).join(' · '), proposal: 'Body text only in colours at 4.5 : 1 or more; 3 : 1 allowed for text 24px and larger; anything lower is for backgrounds and detail only.', swatches: weak.map((h) => ({ hex: h, label: contrast(h, lightBg).toFixed(1) + ':1' })) }));
  if (!scan.styles.length) out.push(ReviewItem.parse({ chapter: 'setup', kind: 'issue', title: 'No colour or text styles in the file', found: 'Values were read from fills and text layers, so near-duplicates may appear.', proposal: 'Set colour and text styles in Figma for the next sync; the review below lists the values read.', input: 'confirm' }));
  return out;
}

const SYSTEM = `You prepare a brand kit that people and AI tools will follow exactly.
You are given a structured scan of a Figma brand guidelines page (text per frame grouped into chapters, colours, type usage, named asset layers).
Produce review items for a studio designer to confirm. Rules:
- Every rule you propose must be measurable and executable: numbers, minimums, ratios, exact values. Never "give it room to breathe".
- Prefer reading values from the scan. When the file doesn't define something the kit needs (clear space, minimum size, grid, line height, tone of voice rules), add a kind "rule" item with a concrete proposed number and say it was not found.
- Flag contradictions between copy and specimens as kind "conflict" with choice options.
- List each real logo/asset layer as kind "asset" with a proposed file name: <client>-<asset>-<layout>-<version>.<ext>, lowercase, hyphens.
- Keep found/proposal to 1–3 sentences each, plain British English, no marketing language. Include a one-line "why" in proposals where useful.
- Use chapter ids: setup, logo, type, colour, layout, imagery, voice, templates. Templates: one "multi" item listing likely outputs.
- node_id: the Figma frame or layer id the item refers to, when known.
Return items via the save_review tool only.`;

export async function claudeItems(scan: FigmaScan, client: string): Promise<ReviewItem[]> {
  const anthropic = new Anthropic({ apiKey: env.anthropicStudioKey() });
  const compact = {
    client, file: scan.fileName, page: scan.pageName,
    chapters: scan.chapters.map((c) => ({ id: c.id, title: c.title, frames: c.frames.map((f) => ({ id: f.id, text: f.texts.map((t) => `[${t.size}px ${t.font}${t.textCase !== 'ORIGINAL' ? ' ' + t.textCase : ''}] ${t.text}`).join(' | ').slice(0, 1800) })) })),
    colours: scan.colours, type: scan.type, assets: scan.assets
  };
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-5-5',
    max_tokens: 16000,
    system: SYSTEM,
    tools: [{ name: 'save_review', description: 'Save the review items.', input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { chapter: { type: 'string' }, kind: { type: 'string', enum: ['asset', 'value', 'rule', 'conflict', 'issue', 'question'] }, title: { type: 'string' }, found: { type: 'string' }, proposal: { type: 'string' }, input: { type: 'string', enum: ['confirm', 'choice', 'multi', 'text'] }, options: { type: 'array', items: { type: 'string' } }, recommend: { type: 'string' }, node_id: { type: ['string', 'null'] }, swatches: { type: 'array', items: { type: 'object', properties: { hex: { type: 'string' }, label: { type: 'string' } }, required: ['hex', 'label'] } } }, required: ['chapter', 'kind', 'title', 'found'] } } }, required: ['items'] } }],
    tool_choice: { type: 'tool', name: 'save_review' },
    messages: [{ role: 'user', content: JSON.stringify(compact) }]
  });
  const call = res.content.find((b) => b.type === 'tool_use');
  if (!call || call.type !== 'tool_use') throw new Error('Claude returned no review.');
  const parsed = z.object({ items: z.array(ReviewItem) }).safeParse(call.input);
  if (!parsed.success) throw new Error('Claude returned an invalid review: ' + parsed.error.message.slice(0, 300));
  return parsed.data.items;
}

export async function buildReview(scan: FigmaScan, client: string) {
  const exact = deterministicItems(scan);
  const drafted = await claudeItems(scan, client);
  const order = STANDARD_CHAPTERS.map(([id]) => id as string);
  return [...exact, ...drafted].sort((a, b) => (order.indexOf(a.chapter) + 99) % 99 - (order.indexOf(b.chapter) + 99) % 99);
}
