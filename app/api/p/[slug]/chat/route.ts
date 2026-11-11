import { z } from 'zod';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { buildSnapshot, projectBySlug, publishedSnapshot } from '@/lib/projects/snapshot';
import { brandSystemPrompt, portalAnthropic, logUsage, NoClientKey } from '@/lib/ai/project';
import { pageContext } from '@/lib/portal/pageContext';
import { logActivity } from '@/lib/activity';
import { portalContext } from '@/lib/portal/context';
import { askCatalog, catalogPrompt } from '@/lib/portal/askCatalog';
import { aiFailure, markKeyRejected } from '@/lib/ai/errors';

export const maxDuration = 60;
const Body = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) })).min(1).max(40),
  path: z.string().max(300).optional(),
  conversationId: z.string().uuid().optional(),
  /** Pictures with the latest question (a design, a post, a page), for feedback against the guidelines */
  images: z.array(z.object({ type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']), data: z.string().max(2_400_000) })).max(4).optional()
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
  let ai, studio = false;
  try { ({ ai, studio } = await portalAnthropic(p.id, acc.staff)); } catch (e) { if (e instanceof NoClientKey) return new Response(e.message, { status: 402 }); throw e; }

  const here = body.data.path ? await pageContext(p.id, slug, snap, body.data.path) : null;
  const sb = adminClient();
  const question = body.data.messages[body.data.messages.length - 1].content;
  let convId = body.data.conversationId;
  if (convId) { const { data: own } = await sb.from('conversations').select('id').eq('id', convId).eq('user_id', acc.user.id).maybeSingle(); if (!own) convId = undefined; }
  if (!convId) { const { data: c } = await sb.from('conversations').insert({ project_id: p.id, user_id: acc.user.id, title: question.slice(0, 80), context: here?.label ?? null }).select('id').single(); convId = c!.id; }
  const pics = body.data.images || [];
  await sb.from('messages').insert({ conversation_id: convId, role: 'user', content: question + (pics.length ? `\n\n[${pics.length} image${pics.length > 1 ? 's' : ''} attached]` : ''), context: here?.label ?? null });
  if (!acc.staff) await logActivity(p.id, acc.user.id, 'ask', here?.label);

  // The cards Ask can show (colours, logos, downloads, pages, typefaces), from the same portal the person sees
  const pc = await portalContext(slug);
  const catalog = pc?.snap ? await askCatalog(pc, slug).catch(() => null) : null;
  const system = brandSystemPrompt(snap) + (catalog ? `\n\n${catalogPrompt(catalog)}` : '') + (here ? `\n\nWHAT THEY'RE LOOKING AT\n${here.text}\nIf they say "this", "here" or "on this page", they mean this. Keep answers short and practical.` : '');
  // The latest question carries any pictures they added
  const msgs = body.data.messages.map((m, i, all) => (i === all.length - 1 && m.role === 'user' && pics.length
    ? { role: 'user' as const, content: [...pics.map((x) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: x.type, data: x.data } })), { type: 'text' as const, text: m.content + '\n\n(Give feedback on the attached image against the guidelines: what follows them, what doesn’t and which rule, and a concrete fix for each. Check any words in it against the voice.)' }] }
    : m));
  const stream = ai.messages.stream({ model: 'claude-sonnet-5-5', max_tokens: pics.length ? 1800 : 1200, system, messages: msgs });
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      let text = '';
      try {
        for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { text += ev.delta.text; controller.enqueue(enc.encode(ev.delta.text)); }
        const final = await stream.finalMessage();
        if (!studio) await logUsage(p.id, acc.user.id, 'chat', final.usage);
        if (!studio && (p.content as { aiKeyRejectedAt?: string } | null)?.aiKeyRejectedAt) await markKeyRejected(p.id, false);
      } catch (e) { const m = (text ? '\n\n' : '') + await aiFailure(p.id, e, studio); text += m; controller.enqueue(enc.encode(m)); }
      await sb.from('messages').insert({ conversation_id: convId, role: 'assistant', content: text || '…' });
      await sb.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId!);
      controller.close();
    }
  }), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Conversation-Id': convId!, 'X-Context': encodeURIComponent(here?.label || ''), 'X-AI': studio ? 'studio' : 'client' } });
}
