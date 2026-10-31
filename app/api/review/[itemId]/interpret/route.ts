import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { studioAnthropic } from '@/lib/ai/studio';

// Turns the designer's explanation into a one-line plan ("Here's what I'll do"), for them to accept.
export async function POST(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { itemId } = await ctx.params;
  const b = z.object({ explanation: z.string().min(1).max(2000), question: z.string().max(300) }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { data: it } = await adminClient().from('review_items').select('kind, title, found, proposal').eq('id', itemId).single();
  if (!it) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const res = await studioAnthropic().messages.create({
      model: 'claude-sonnet-5-5', max_tokens: 300,
      system: 'A brand designer answered a question about their brand guidelines handover. Reply with ONE sentence, under 30 words, saying exactly what you will do in the brand kit as a result, in first person ("I’ll …"). Be concrete (file names, numbers, where it goes). No preamble.',
      messages: [{ role: 'user', content: `Item: ${it.title}\nFound: ${it.found}\nOriginal proposal: ${it.proposal}\nQuestion asked: ${b.data.question}\nTheir answer: ${b.data.explanation}` }]
    });
    const plan = res.content.filter((x) => x.type === 'text').map((x) => (x as { text: string }).text).join(' ').trim();
    return NextResponse.json({ plan: plan || `I’ll use your answer: “${b.data.explanation}”` });
  } catch { return NextResponse.json({ plan: `I’ll use your answer: “${b.data.explanation.slice(0, 160)}”` }); }
}
