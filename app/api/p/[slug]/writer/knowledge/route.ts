import { z } from 'zod';
import { NextResponse } from 'next/server';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';
import { portalAnthropic, logUsage, NoClientKey } from '@/lib/ai/project';
import { callTool } from '@/lib/ai/tool';
import { logActivity } from '@/lib/activity';
import { readKnowledge, type KnowledgeEntry } from '@/lib/voiceKnowledge';
import { nameOf } from '@/lib/guideVersions';

export const maxDuration = 120;
const KEEP = 300;
const Body = z.object({
  kind: z.enum(['worked', 'liked', 'missed']),
  text: z.string().max(6000).optional(),
  note: z.string().max(1000).optional(),
  where: z.string().max(80).optional(),
  images: z.array(z.object({ type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']), data: z.string().max(2_400_000) })).max(3).optional()
});

async function save(projectId: string, change: (l: KnowledgeEntry[]) => KnowledgeEntry[]) {
  const sb = adminClient();
  const { data } = await sb.from('projects').select('content').eq('id', projectId).maybeSingle();
  const content = (data?.content as Record<string, unknown>) || {};
  const next = change(readKnowledge(content)).slice(0, KEEP);
  await sb.from('projects').update({ content: { ...content, voiceKnowledge: next } }).eq('id', projectId);
  return next;
}
const pub = (l: KnowledgeEntry[]) => l.map(({ byId: _b, ...e }) => e);

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const p = await projectBySlug(slug); if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const acc = await requireProjectAccess(p.id); if (acc instanceof Response) return acc;
  const list = readKnowledge(p.content);
  return NextResponse.json({ entries: pub(list), mine: list.filter((e) => acc.staff || acc.clientAdmin || e.byId === acc.user.id).map((e) => e.id) });
}

// Add something that worked (or that the team loves, or that missed). A picture is read once for its words and
// kept as text; the picture itself isn't stored.
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const p = await projectBySlug(slug); if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const acc = await requireProjectAccess(p.id); if (acc instanceof Response) return acc;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const q = b.data;
  let text = (q.text || '').trim(), fromImage = false;
  if (q.images?.length) {
    let ai, studio = false;
    try { ({ ai, studio } = await portalAnthropic(p.id, acc.staff)); } catch (e) { if (e instanceof NoClientKey) return NextResponse.json({ error: e.message }, { status: 402 }); throw e; }
    try {
      const res = await callTool<{ copy: string }>(ai, {
        model: 'claude-sonnet-5-5', max_tokens: 1500,
        system: `You read the words in pictures of ${p.client}'s marketing (ads, posts, emails, signs) so they can be kept as examples of copy. Transcribe the copy exactly, keeping its hierarchy (headline, then body, then call to action) on separate lines. Leave out legal small print, prices and URLs unless they're the point. If there are no words, describe in one line what the piece says.`,
        messages: [{ role: 'user', content: [...q.images.map((x) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: x.type, data: x.data } })), { type: 'text' as const, text: text ? `Their note: ${text}` : 'Transcribe the copy.' }] }],
        tool: { name: 'copy', description: 'The copy in the picture', input_schema: { type: 'object', properties: { copy: { type: 'string' } }, required: ['copy'] } }
      });
      if (!studio) await logUsage(p.id, acc.user.id, 'writer', res.usage);
      const read = (res.input?.copy || '').trim();
      if (read) { text = text ? `${read}\n\n${text}` : read; fromImage = true; }
    } catch { return NextResponse.json({ error: 'Couldn’t read the picture. Paste the words instead.' }, { status: 502 }); }
  }
  if (!text) return NextResponse.json({ error: 'Add the words, or a picture of the piece.' }, { status: 400 });
  const entry: KnowledgeEntry = { id: 'k-' + Math.random().toString(36).slice(2, 10), kind: q.kind, text: text.slice(0, 6000), note: q.note?.trim() || undefined, where: q.where?.trim() || undefined, by: acc.staff ? 'Lost Property' : nameOf(acc.user), byId: acc.user.id, at: new Date().toISOString(), fromImage: fromImage || undefined };
  const list = await save(p.id, (l) => [entry, ...l]);
  if (!acc.staff) await logActivity(p.id, acc.user.id, 'tool', 'Writer knowledge');
  return NextResponse.json({ entry: pub([entry])[0], count: list.length });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const p = await projectBySlug(slug); if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const acc = await requireProjectAccess(p.id); if (acc instanceof Response) return acc;
  const id = new URL(req.url).searchParams.get('id');
  const e = readKnowledge(p.content).find((x) => x.id === id);
  if (!e) return NextResponse.json({ ok: true });
  // The studio and the client's admins can take anything out; everyone else only what they added
  if (!acc.staff && !acc.clientAdmin && e.byId !== acc.user.id) return NextResponse.json({ error: 'Only the person who added this, or an admin, can remove it.' }, { status: 403 });
  await save(p.id, (l) => l.filter((x) => x.id !== id));
  return NextResponse.json({ ok: true });
}
