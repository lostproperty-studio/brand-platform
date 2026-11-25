import { NextResponse } from 'next/server';
import { z } from 'zod';
import { portalV2 } from '@/lib/portalVersion';
import { buildSnapshot, publishedSnapshot } from '@/lib/projects/snapshot';
import { brandSystemPrompt, logUsage, NoClientKey, portalAnthropic } from '@/lib/ai/project';
import { readPanel } from '@/lib/plugins/catalog';
import { adminClient } from '@/lib/supabase/server';
import { panelCaller, panelCors } from '@/lib/plugins/panelAuth';

export const maxDuration = 60;
const Body = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).min(1).max(20), where: z.string().max(40).optional() });

// Ask, inside the panel: short answers from the guidelines, on the client's own AI key, as in the portal
export async function POST(req: Request) {
  if (!portalV2()) return new Response('Not found', { status: 404 });
  const cors = panelCors(req);
  const who = await panelCaller(req);
  if (!who) return new Response('Sign in again', { status: 401, headers: cors });
  const { data: p } = await adminClient().from('projects').select('content').eq('id', who.projectId).maybeSingle();
  if (!readPanel(p?.content).ask) return new Response('Ask is turned off for this panel.', { status: 403, headers: cors });
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return new Response('Bad request', { status: 400, headers: cors });
  const snap = (who.staff ? await buildSnapshot(who.projectId).catch(() => null) : null) || await publishedSnapshot(who.projectId);
  if (!snap) return new Response('This brand hasn’t been published yet.', { status: 409, headers: cors });
  let ai;
  try { ({ ai } = await portalAnthropic(who.projectId, who.staff)); } catch (e) { if (e instanceof NoClientKey) return new Response(e.message, { status: 402, headers: cors }); throw e; }
  const r = await ai.messages.create({
    model: 'claude-sonnet-5-5', max_tokens: 700,
    system: `${brandSystemPrompt(snap, { cite: 'none', voice: true })}\n\nYou are answering inside a small side panel in ${body.data.where || 'a design app'}. Keep answers short: a few sentences or a short list. Give exact values. No headings.`,
    messages: body.data.messages
  });
  await logUsage(who.projectId, who.userId, 'chat', r.usage).catch(() => {});
  const text = r.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  return NextResponse.json({ answer: text }, { headers: cors });
}
export async function OPTIONS(req: Request) { return new Response(null, { status: 204, headers: panelCors(req) }); }
