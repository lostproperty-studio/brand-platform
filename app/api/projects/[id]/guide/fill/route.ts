import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { studioAnthropic } from '@/lib/ai/studio';
import { aboutMd, readForm } from '@/lib/brandForm';
import { chapterText, normaliseGuide, type Guide } from '@/lib/portal/guide';

export const maxDuration = 60;

// Fill with AI: a first draft of one piece of text on a guidelines page, written from what's around it.
const Body = z.object({
  kind: z.enum(['label', 'heading', 'text']),
  current: z.string().max(4000).optional(),
  chapter: z.object({ title: z.string().max(200), lede: z.string().max(2000).optional() }),
  section: z.object({ kind: z.string().max(40), eyebrow: z.string().max(300).optional(), heading: z.string().max(500).optional(), body: z.string().max(4000).optional() }),
  box: z.array(z.object({ kind: z.string().max(20), text: z.string().max(2000), target: z.boolean().optional() })).max(20).optional(),
  others: z.array(z.string().max(1500)).max(12).optional(),
  before: z.string().max(3000).optional(), after: z.string().max(3000).optional()
});

const LIMIT: Record<string, string> = { label: 'a label of one to three words', heading: 'a headline of under ten words', text: 'body text of one to three sentences (longer only if the texts around it are longer)' };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'guidelines'); if (gate) return gate; }
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const d = b.data;
  const { data: p } = await adminClient().from('projects').select('client, line, content').eq('id', id).single();
  const g = normaliseGuide((p?.content as { guide?: Guide } | null)?.guide);
  const voice = g?.chapters.find((c) => c.key === 'voice' && !c.removed);
  const voiceText = voice ? chapterText(voice).join(' ').slice(0, 1800) : '';
  const about = aboutMd(readForm(p?.content));

  const system = `You draft copy for a brand guidelines page that Lost Property Studio is making for ${p?.client || 'a client'}. Write ${LIMIT[d.kind]} for the slot marked [THIS].
- Write it from the context only: the chapter, the section and the texts around it. Match their length, rhythm and tone; if the boxes next to it are three-word headlines, write a three-word headline.
- Never invent facts: no figures, names, dates, places, claims or strategy the context doesn't support. Where the context doesn't give enough to say something true, write a short placeholder in square brackets saying what belongs there, e.g. [The brand's purpose, in one sentence].
- Plain British English, in the brand's voice if it's described below. No quotation marks, no markdown, no preamble. Answer with the text only.`;
  const box = d.box?.length ? `\nTHE BOX, IN ORDER:\n${d.box.map((x) => `- ${x.kind}: ${x.target ? '[THIS]' : x.text}`).join('\n')}` : '';
  const user = `CLIENT: ${p?.client}${p?.line ? ` · ${p.line}` : ''}
${about ? `\n${about}` : ''}${voiceText ? `\nTONE OF VOICE CHAPTER: ${voiceText}\n` : ''}
CHAPTER: ${d.chapter.title}${d.chapter.lede ? ` · ${d.chapter.lede}` : ''}
${d.before ? `SECTION BEFORE: ${d.before}\n` : ''}THIS SECTION (${d.section.kind}): ${[d.section.eyebrow, d.section.heading, d.section.body].filter(Boolean).join(' · ') || '(nothing yet)'}${box}
${d.others?.length ? `OTHER BOXES IN THIS SECTION:\n${d.others.map((o) => `- ${o}`).join('\n')}\n` : ''}${d.after ? `SECTION AFTER: ${d.after}\n` : ''}
${d.current && !/^(write something…|headline|label|text|a headline for this card)$/i.test(d.current.trim()) ? `WHAT'S THERE NOW (improve or rewrite it): ${d.current}\n` : ''}Write the ${d.kind === 'text' ? 'text' : d.kind} for [THIS].`;
  try {
    const res = await studioAnthropic().messages.create({ model: 'claude-sonnet-5-5', max_tokens: 500, system, messages: [{ role: 'user', content: user }] });
    const text = res.content.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text).join('').trim().replace(/^["“]|["”]$/g, '');
    if (!text) return NextResponse.json({ error: 'The AI didn’t write anything. Try again.' }, { status: 502 });
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: /api[_ ]key|authentication/i.test(String(e)) ? 'The studio’s AI key isn’t set up (ANTHROPIC_API_KEY).' : 'The AI couldn’t write a draft just now. Try again.' }, { status: 500 });
  }
}
