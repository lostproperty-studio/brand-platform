import { NextResponse } from 'next/server';
import { aiFailure, markKeyRejected } from '@/lib/ai/errors';
import { z } from 'zod';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { buildSnapshot, projectBySlug, publishedSnapshot } from '@/lib/projects/snapshot';
import { brandSystemPrompt, clientAnthropic, logUsage, NoClientKey } from '@/lib/ai/project';

export const maxDuration = 60;
const Control = z.object({ id: z.string().max(20), type: z.string().max(20), label: z.string().max(120), value: z.union([z.string().max(4000), z.boolean()]).optional(), options: z.array(z.string().max(120)).max(40).optional(), min: z.string().optional(), max: z.string().optional() });
const Body = z.object({
  prompt: z.string().min(1).max(2000),
  controls: z.array(Control).max(150),
  headings: z.array(z.string().max(200)).max(12).optional(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).max(20).optional(),
  conversationId: z.string().uuid().optional()
});

// Drives an uploaded tool from a prompt. Claude sees the tool's controls (as the bridge reads them) and returns
// the changes to make; the browser applies them inside the tool. Runs on the client's own key.
export async function POST(req: Request, ctx: { params: Promise<{ slug: string; toolId: string }> }) {
  const { slug, toolId } = await ctx.params;
  const p = await projectBySlug(slug);
  if (!p) return new Response('Not found', { status: 404 });
  const acc = await requireProjectAccess(p.id);
  if (acc instanceof Response) return acc;
  const sb = adminClient();
  const { data: tool } = await sb.from('tools').select('name, description, ai_enabled').eq('id', toolId).eq('project_id', p.id).maybeSingle();
  if (!tool || !tool.ai_enabled) return NextResponse.json({ error: 'AI isn’t switched on for this tool.' }, { status: 400 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const snap = acc.staff ? await buildSnapshot(p.id) : await publishedSnapshot(p.id);
  if (!snap) return NextResponse.json({ error: 'This portal hasn’t been published yet.' }, { status: 409 });
  let ai;
  try { ai = await clientAnthropic(p.id); } catch (e) { if (e instanceof NoClientKey) return NextResponse.json({ error: e.message }, { status: 402 }); throw e; }

  const system = brandSystemPrompt(snap) + `

You are operating the tool "${tool.name}" inside the brand portal for the person. ${tool.description}
The tool's visible headings: ${(b.data.headings || []).join(' · ')}
You can't see the tool, only its controls (listed as JSON with id, type, label, current value and options).
To act, call operate_tool once with every change in order: "set" a control's value (for selects use an option's exact text; for checkboxes true/false), or "click" a button. Choose formats, sizes and options that match the request, write any copy in the brand's tone of voice and within its rules, and never invent controls.
Then say in one or two short sentences what you did and anything the person should do next (for example upload a photo, since you can't).`;
  const messages = [...(b.data.history || []), { role: 'user' as const, content: `${b.data.prompt}\n\nCONTROLS\n${JSON.stringify(b.data.controls)}` }];
  let res;
  try { res = await ai.messages.create({
    model: 'claude-sonnet-5-5', max_tokens: 2000, system, messages,
    tools: [{ name: 'operate_tool', description: 'Change the tool’s controls, in order.', input_schema: { type: 'object', properties: { actions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['set', 'click'] }, id: { type: 'string' }, value: { type: ['string', 'boolean', 'number'] } }, required: ['type', 'id'] } } }, required: ['actions'] } }],
    tool_choice: { type: 'auto' }
  }); } catch (e) { return NextResponse.json({ error: await aiFailure(p.id, e) }, { status: 502 }); }
  await logUsage(p.id, acc.user.id, 'canvas', res.usage);
  if ((p.content as { aiKeyRejectedAt?: string } | null)?.aiKeyRejectedAt) await markKeyRejected(p.id, false);
  const call = res.content.find((x) => x.type === 'tool_use');
  const actions = call && call.type === 'tool_use' ? ((call.input as { actions?: unknown[] }).actions || []) : [];
  const message = res.content.filter((x) => x.type === 'text').map((x) => (x as { text: string }).text).join('\n').trim() || (actions.length ? 'Done.' : 'I couldn’t find controls in this tool to make that change.');

  // Keep the exchange in the person's history for this tool
  let convId = b.data.conversationId;
  if (convId) { const { data: own } = await sb.from('conversations').select('id').eq('id', convId).eq('user_id', acc.user.id).maybeSingle(); if (!own) convId = undefined; }
  if (!convId) { const { data: c } = await sb.from('conversations').insert({ project_id: p.id, user_id: acc.user.id, title: b.data.prompt.slice(0, 80), context: tool.name, tool_id: toolId }).select('id').single(); convId = c!.id; }
  await sb.from('messages').insert([{ conversation_id: convId, role: 'user', content: b.data.prompt, context: tool.name }, { conversation_id: convId, role: 'assistant', content: message }]);
  return NextResponse.json({ actions, message, conversationId: convId });
}
