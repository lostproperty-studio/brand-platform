import { z } from 'zod';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { buildSnapshot, projectBySlug, publishedSnapshot } from '@/lib/projects/snapshot';
import { brandSystemPrompt, clientAnthropic, logUsage, NoClientKey } from '@/lib/ai/project';
import { pageContext } from '@/lib/portal/pageContext';
import { logActivity } from '@/lib/activity';
import { aiFailure, markKeyRejected } from '@/lib/ai/errors';

export const maxDuration = 60;
const Body = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) })).min(1).max(40),
  path: z.string().max(300).optional(),
  conversationId: z.string().uuid().optional()
});

// Ask: brand chat that knows which page the person is on, streamed as plain text on the client's own key.
// Each conversation is saved to the person who asked it.
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const p = await projectBySlug(slug);
  if (!p) return new Response('Not found', { status: 404 });
  const acc = await requireProjectAccess(p.id);
  if (acc instanceof Response) return acc;
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return new Response('Bad request', { status: 400 });
  const snap = acc.staff ? await buildSnapshot(p.id) : await publishedSnapshot(p.id);
  if (!snap) return new Response('This portal hasn’t been published yet.', { status: 409 });
  let ai;
  try { ai = await clientAnthropic(p.id); } catch (e) { if (e instanceof NoClientKey) return new Response(e.message, { status: 402 }); throw e; }

  const here = body.data.path ? await pageContext(p.id, slug, snap, body.data.path) : null;
  const sb = adminClient();
  const question = body.data.messages[body.data.messages.length - 1].content;
  let convId = body.data.conversationId;
  if (convId) { const { data: own } = await sb.from('conversations').select('id').eq('id', convId).eq('user_id', acc.user.id).maybeSingle(); if (!own) convId = undefined; }
  if (!convId) { const { data: c } = await sb.from('conversations').insert({ project_id: p.id, user_id: acc.user.id, title: question.slice(0, 80), context: here?.label ?? null }).select('id').single(); convId = c!.id; }
  await sb.from('messages').insert({ conversation_id: convId, role: 'user', content: question, context: here?.label ?? null });
  if (!acc.staff) await logActivity(p.id, acc.user.id, 'ask', here?.label);

  const system = brandSystemPrompt(snap) + (here ? `\n\nWHAT THEY'RE LOOKING AT\n${here.text}\nIf they say "this", "here" or "on this page", they mean this. Keep answers short and practical.` : '');
  const stream = ai.messages.stream({ model: 'claude-sonnet-5-5', max_tokens: 1200, system, messages: body.data.messages });
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      let text = '';
      try {
        for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { text += ev.delta.text; controller.enqueue(enc.encode(ev.delta.text)); }
        const final = await stream.finalMessage();
        await logUsage(p.id, acc.user.id, 'chat', final.usage);
        if ((p.content as { aiKeyRejectedAt?: string } | null)?.aiKeyRejectedAt) await markKeyRejected(p.id, false);
      } catch (e) { const m = (text ? '\n\n' : '') + await aiFailure(p.id, e); text += m; controller.enqueue(enc.encode(m)); }
      await sb.from('messages').insert({ conversation_id: convId, role: 'assistant', content: text || '…' });
      await sb.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId!);
      controller.close();
    }
  }), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Conversation-Id': convId!, 'X-Context': encodeURIComponent(here?.label || '') } });
}
