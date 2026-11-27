import { z } from 'zod';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { buildSnapshot, projectBySlug, publishedSnapshot } from '@/lib/projects/snapshot';
import { brandSystemPrompt, portalAnthropic, logUsage, NoClientKey } from '@/lib/ai/project';
import { pageContext } from '@/lib/portal/pageContext';
import { logActivity } from '@/lib/activity';
import { portalContext } from '@/lib/portal/context';
import { askCatalog, catalogPrompt } from '@/lib/portal/askCatalog';
import { aiFailure, markKeyRejected } from '@/lib/ai/errors';
import { CHAT, noAnswer } from '@/lib/ai/answer';

export const maxDuration = 60;
const Pic = z.object({ type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']), data: z.string().max(2_400_000) });
const Body = z.object({
  /** Each question can carry the pictures that came with it, so later questions can still refer to them */
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000), images: z.array(Pic).max(4).optional() })).min(1).max(40),
  path: z.string().max(300).optional(),
  conversationId: z.string().uuid().optional(),
  /** Pictures with the latest question (a design, a post, a page), for feedback against the guidelines */
  images: z.array(Pic).max(4).optional()
});
const MAX_PICS = 8;

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
  try { ({ ai, studio } = await portalAnthropic(p.id, acc.staff, acc.user.id)); } catch (e) { if (e instanceof NoClientKey) return new Response(e.message, { status: 402 }); throw e; }

  const here = body.data.path ? await pageContext(p.id, slug, snap, body.data.path) : null;
  const sb = adminClient();
  const question = body.data.messages[body.data.messages.length - 1].content;
  let convId = body.data.conversationId;
  if (convId) { const { data: own } = await sb.from('conversations').select('id').eq('id', convId).eq('user_id', acc.user.id).maybeSingle(); if (!own) convId = undefined; }
  if (!convId) { const { data: c } = await sb.from('conversations').insert({ project_id: p.id, user_id: acc.user.id, title: question.slice(0, 80), context: here?.label ?? null }).select('id').single(); convId = c!.id; }
  // The pictures with the latest question (sent with it, or on their own by an older page)
  const last = body.data.messages[body.data.messages.length - 1];
  const pics = last.images?.length ? last.images : body.data.images || [];
  await sb.from('messages').insert({ conversation_id: convId, role: 'user', content: question + (pics.length ? `\n\n[${pics.length} image${pics.length > 1 ? 's' : ''} attached]` : ''), context: here?.label ?? null });
  if (!acc.staff) await logActivity(p.id, acc.user.id, 'ask', here?.label);

  // The cards Ask can show (colours, logos, downloads, pages, typefaces), from the same portal the person sees
  const pc = await portalContext(slug);
  const catalog = pc?.snap ? await askCatalog(pc, slug).catch(() => null) : null;
  const system = brandSystemPrompt(snap, { cite: 'none', voice: true }) + (catalog ? `\n\n${catalogPrompt(catalog)}` : '') + (here ? `\n\nWHAT THEY'RE LOOKING AT\n${here.text}\nIf they say "this", "here" or "on this page", they mean this. Keep answers short and practical.` : '');
  // Every question keeps the pictures that came with it (the most recent few, if there are many), so "this" and
  // "the poster" still mean something three questions later
  let room = MAX_PICS;
  const withPics = body.data.messages.map((m, i, all) => ({ ...m, images: i === all.length - 1 ? pics : m.images || [] }));
  for (let i = withPics.length - 1; i >= 0; i--) { const im = withPics[i].images, keep = Math.min(room, im.length); withPics[i].images = keep ? im.slice(im.length - keep) : []; room -= keep; }
  const msgs = withPics.map((m) => (m.role === 'user' && m.images.length
    ? { role: 'user' as const, content: [...m.images.map((x) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: x.type, data: x.data } })), { type: 'text' as const, text: m.content }] }
    : { role: m.role, content: m.content }));
  const stream = ai.messages.stream({ model: 'claude-sonnet-5-5', ...CHAT, system, messages: msgs });
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      let text = '';
      try {
        for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { text += ev.delta.text; controller.enqueue(enc.encode(ev.delta.text)); }
        const final = await stream.finalMessage();
        // Never leave an empty answer: say what happened instead
        if (!text.trim()) { const m = noAnswer(final.stop_reason); text = m; controller.enqueue(enc.encode(m)); }
        if (!studio) await logUsage(p.id, acc.user.id, 'chat', final.usage);
        if (!studio && (p.content as { aiKeyRejectedAt?: string } | null)?.aiKeyRejectedAt) await markKeyRejected(p.id, false);
      } catch (e) { const m = (text ? '\n\n' : '') + await aiFailure(p.id, e, studio); text += m; controller.enqueue(enc.encode(m)); }
      await sb.from('messages').insert({ conversation_id: convId, role: 'assistant', content: text || '…' });
      await sb.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId!);
      controller.close();
    }
  }), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Conversation-Id': convId!, 'X-Context': encodeURIComponent(here?.label || ''), 'X-AI': studio ? 'studio' : 'client' } });
}
