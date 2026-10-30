import { z } from 'zod';
import { requireProjectAccess } from '@/lib/supabase/server';
import { buildSnapshot, projectBySlug, publishedSnapshot } from '@/lib/projects/snapshot';
import { brandSystemPrompt, clientAnthropic, logUsage, NoClientKey } from '@/lib/ai/project';

export const maxDuration = 60;
const Body = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) })).min(1).max(40) });

// Brand chat, streamed as plain text. Runs on the client's own key.
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const p = await projectBySlug(slug);
  if (!p) return new Response('Not found', { status: 404 });
  const acc = await requireProjectAccess(p.id);
  if (acc instanceof Response) return acc;
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return new Response('Bad request', { status: 400 });
  const snap = acc.staff ? await buildSnapshot(p.id) : await publishedSnapshot(p.id); // studio previews the working copy
  if (!snap) return new Response('This portal hasn’t been published yet.', { status: 409 });
  let ai;
  try { ai = await clientAnthropic(p.id); } catch (e) { if (e instanceof NoClientKey) return new Response(e.message, { status: 402 }); throw e; }

  const stream = ai.messages.stream({ model: 'claude-sonnet-5-5', max_tokens: 1200, system: brandSystemPrompt(snap), messages: body.data.messages });
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') controller.enqueue(enc.encode(ev.delta.text));
        const final = await stream.finalMessage();
        await logUsage(p.id, acc.user.id, 'chat', final.usage);
      } catch (e) { controller.enqueue(enc.encode('\n\n[The AI request failed: ' + (e as Error).message + ']')); }
      controller.close();
    }
  }), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
