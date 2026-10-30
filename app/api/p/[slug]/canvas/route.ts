import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug, publishedSnapshot } from '@/lib/projects/snapshot';
import { brandSystemPrompt, clientAnthropic, logUsage, NoClientKey } from '@/lib/ai/project';

export const maxDuration = 60;
const Body = z.object({ prompt: z.string().min(1).max(2000), current: z.record(z.unknown()).optional(), templates: z.array(z.string()).max(20) });

// Canvas: turns a request into slot values for a locked template. The layout and logo never change.
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const p = await projectBySlug(slug);
  if (!p) return new Response('Not found', { status: 404 });
  const acc = await requireProjectAccess(p.id);
  if (acc instanceof Response) return acc;
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const snap = await publishedSnapshot(p.id);
  if (!snap) return NextResponse.json({ error: 'This portal hasn’t been published yet.' }, { status: 409 });
  let ai;
  try { ai = await clientAnthropic(p.id); } catch (e) { if (e instanceof NoClientKey) return NextResponse.json({ error: e.message }, { status: 402 }); throw e; }

  const res = await ai.messages.create({
    model: 'claude-sonnet-5-5', max_tokens: 800,
    system: brandSystemPrompt(snap) + '\n\nYou fill template slots for on-brand layouts. Follow every rule above exactly; keep headlines within the type rules. Explain any rule you applied in one sentence. Always answer by calling fill_template.',
    tools: [{ name: 'fill_template', description: 'Choose a template and fill its slots.', input_schema: { type: 'object', properties: { template: { type: 'string', enum: body.data.templates }, eyebrow: { type: 'string' }, headline: { type: 'string' }, body: { type: 'string' }, image_hint: { type: 'string', description: 'Which kind of image to use, per the imagery rules' }, note: { type: 'string', description: 'One sentence on what was done and which rule applied' } }, required: ['template', 'headline', 'note'] } }],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: `Current layout: ${JSON.stringify(body.data.current || {})}\nRequest: ${body.data.prompt}` }]
  });
  await logUsage(p.id, acc.user.id, 'canvas', res.usage);
  const call = res.content.find((b) => b.type === 'tool_use');
  return NextResponse.json(call && call.type === 'tool_use' ? call.input : { error: 'No layout returned' });
}
