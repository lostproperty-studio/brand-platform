import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { studioAnthropic } from '@/lib/ai/studio';
import { aboutMd, readForm } from '@/lib/brandForm';
import { normaliseGuide, type Guide } from '@/lib/portal/guide';
import { getPlaybook } from '@/lib/playbookStore';
import { tierOf, tierOutline, tierLabel } from '@/lib/playbook';
import { benchmark, guideMap, type ReviewResult, type ReviewSession } from '@/lib/review/director';

export const maxDuration = 300;

// The creative director: reviews the guide against the studio's standard and coworks with the designer on it.
// "start" reads the guide and returns structured notes (direction kept apart from proofing); "chat" talks them through.
const Msg = z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) });
const Body = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('start'), depth: z.enum(['big', 'detail', 'both']), chapter: z.string().max(200).nullable().optional(), focus: z.string().max(1000).optional() }),
  z.object({ mode: z.literal('chat'), messages: z.array(Msg).min(1).max(40), selection: z.array(z.string().max(80)).max(60).optional() })
]);

const MODEL = 'claude-opus-5-5';

function persona(client: string) {
  return `You are the creative director at Lost Property Studio, an independent brand studio in London. You're reviewing the online brand guidelines the team is making for ${client}, sitting next to the designer in the editor. You know what a great guide looks like, and you coach: you explain why, so they get better at this, not just fix this guide.

How you work:
- Judge against the studio's standard below (the house rules and what this tier needs), not personal taste.
- Keep two kinds of feedback apart. DIRECTION is high level: the story and order of the guide, whether each page makes one point, headlines that claim or count, missing pages or rules, guidance that's vague or can't be followed, consistency across chapters, engagement. DETAIL is specific: spelling, grammar, punctuation, a clumsy sentence, a headline that breaks house style, inconsistent terms or capitalisation.
- Be specific and brief. Point at the text with its reference, e.g. [C2.S4.heading]. Quote exactly.
- Ask questions where the answer belongs to the designer or the client. Never invent strategy (purpose, values, positioning, tone words, audiences): if it's missing, say it's missing and ask; use a bracketed placeholder like [The brand's purpose] if you show wording.
- You may suggest wording for guidance copy (headlines of rule pages, instructions, labels, captions) and corrections. British English. Sentence case headlines with no full stop, first person plural, as the house rules say.
- Only ever talk about this client's guide. The studio benchmark is structure only; never mention other clients.
- Warm, direct and confident, like a good CD in a crit. No filler, no flattery; say what's working when it is.`;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'guidelines'); if (gate) return gate; }
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('client, line, content').eq('id', id).single();
  const content = (p?.content || {}) as { guide?: Guide; reviewSession?: ReviewSession };
  const g = normaliseGuide(content.guide);
  if (!g) return NextResponse.json({ error: 'Build the guidelines first.' }, { status: 400 });
  const client = p?.client || 'the client';
  const playbook = await getPlaybook();
  const tier = tierOf(content);
  const { data: others } = await sb.from('projects').select('id, content->guide').neq('id', id).order('updated_at', { ascending: false }).limit(20);
  const bench = benchmark((others || []).map((o) => normaliseGuide((o as unknown as { guide?: Guide }).guide)).filter(Boolean) as Guide[]);
  const about = aboutMd(readForm(p?.content));
  const standard = `THE STUDIO'S STANDARD\n${playbook.house}\n\n${tier ? `THIS GUIDE IS ${tierLabel(tier).toUpperCase()} TIER. IT SHOULD COVER:\n${tierOutline(playbook, tier)}` : 'The tier is not set yet.'}${bench ? `\n\n${bench}` : ''}`;

  if (b.data.mode === 'start') {
    const { depth, chapter, focus } = b.data;
    const map = guideMap(g, chapter || null);
    if (!Object.keys(map.refs).length) return NextResponse.json({ error: 'There’s no text to review in that chapter yet.' }, { status: 400 });
    const ask = depth === 'big' ? 'Give DIRECTION only: up to 7 notes, most important first. Leave detail empty.'
      : depth === 'detail' ? 'Give DETAIL only: every spelling, grammar, punctuation, wording and house-style fix you find (up to 60), in reading order. Keep direction to at most 2 notes, only if something is seriously wrong.'
      : 'Give both: up to 6 DIRECTION notes, most important first, and the DETAIL fixes (up to 50) in reading order.';
    const tool = {
      name: 'record_review',
      description: 'Record the review',
      input_schema: {
        type: 'object' as const,
        properties: {
          summary: { type: 'string', description: 'Two or three sentences: your overall read, in your voice, addressed to the designer.' },
          strengths: { type: 'array', items: { type: 'string' }, description: 'Up to three things working well, briefly.' },
          big: { type: 'array', items: { type: 'object', properties: {
            title: { type: 'string', description: 'The note as a short headline' },
            steer: { type: 'string', description: 'What to do, specifically. One to three sentences.' },
            why: { type: 'string', description: 'Why it matters, tied to the standard. One sentence.' },
            question: { type: 'string', description: 'Optional: a question for the designer that would unlock it' },
            refs: { type: 'array', items: { type: 'string' }, description: 'References it is about, e.g. C2.S4.heading or C3.title' }
          }, required: ['title', 'steer'] } },
          detail: { type: 'array', items: { type: 'object', properties: {
            ref: { type: 'string', description: 'The exact reference of the text, e.g. C2.S4.F1.body' },
            kind: { type: 'string', enum: ['spelling', 'grammar', 'punctuation', 'clarity', 'consistency', 'headline', 'house style'] },
            quote: { type: 'string', description: 'The exact words to change, copied character for character from that text (as short as makes it unique)' },
            suggestion: { type: 'string', description: 'The replacement for exactly those words' },
            note: { type: 'string', description: 'Optional: a few words on why' }
          }, required: ['ref', 'kind', 'quote', 'suggestion'] } },
          questions: { type: 'array', items: { type: 'string' }, description: 'Up to four open questions for the designer or client' }
        },
        required: ['summary', 'big', 'detail']
      }
    };
    const user = `CLIENT: ${client}${p?.line ? ` · ${p.line}` : ''}${about ? `\n${about}` : ''}

${standard}

THE GUIDE${chapter ? ' (ONE CHAPTER)' : ''}, WITH REFERENCES:
${map.text}

${focus ? `THE DESIGNER ASKS YOU TO FOCUS ON: ${focus}\n\n` : ''}${ask} Then call record_review.`;
    try {
      const res = await studioAnthropic().messages.create({ model: MODEL, max_tokens: 8000, system: persona(client), tools: [tool], tool_choice: { type: 'tool', name: 'record_review' }, messages: [{ role: 'user', content: user }] });
      const out = res.content.find((c) => c.type === 'tool_use') as { input: Omit<ReviewResult, 'big' | 'detail'> & { big?: Omit<ReviewResult['big'][number], 'id'>[]; detail?: Omit<ReviewResult['detail'][number], 'id'>[] } } | undefined;
      if (!out) return NextResponse.json({ error: 'The review didn’t come back. Try again.' }, { status: 502 });
      // Keep only fixes that point at real text and quote it exactly, so Apply always works
      const textOf = (ref: string) => { const m = map.text.match(new RegExp(`\\[${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\] [^:]+: (.*)`)); return m?.[1] || ''; };
      const result: ReviewResult = {
        summary: out.input.summary || '', strengths: (out.input.strengths || []).slice(0, 3), questions: (out.input.questions || []).slice(0, 4),
        big: (out.input.big || []).slice(0, 8).map((x, i) => ({ ...x, id: 'b' + i, refs: (x.refs || []).filter((r) => map.refs[r]) })),
        detail: (out.input.detail || []).filter((x) => map.refs[x.ref] && x.quote && x.quote !== x.suggestion && textOf(x.ref).includes(x.quote)).slice(0, 60).map((x, i) => ({ ...x, id: 'd' + i }))
      };
      const session: ReviewSession = { at: new Date().toISOString(), depth, chapter: chapter || null, focus, result, refs: map.refs, closed: {}, messages: [] };
      await sb.from('projects').update({ content: { ...(p?.content as object), reviewSession: session } }).eq('id', id);
      return NextResponse.json({ session });
    } catch (e) {
      return NextResponse.json({ error: /api[_ ]key|authentication/i.test(String(e)) ? 'The studio’s AI key isn’t set up (ANTHROPIC_API_KEY).' : 'The review couldn’t run just now. Try again.' }, { status: 500 });
    }
  }

  // A conversation about the review: the latest guide text, the notes so far, and the thread
  const s = content.reviewSession;
  const map = guideMap(g, s?.chapter || null);
  const notes = s ? `YOUR REVIEW SO FAR (${s.depth === 'big' ? 'direction' : s.depth === 'detail' ? 'detail' : 'direction and detail'}${s.chapter ? ', one chapter' : ''}):
Summary: ${s.result.summary}
${s.result.big.map((x) => `- [${s.closed?.[x.id] || 'open'}] ${x.title}: ${x.steer}`).join('\n')}
${s.result.detail.length ? `${s.result.detail.length} detail fixes, ${Object.keys(s.closed || {}).filter((k) => k.startsWith('d')).length} dealt with.` : ''}` : 'No review has been run yet.';
  // What the designer has selected in the editor: help with that, unless they ask about something else
  const whole = guideMap(g, null);
  const picked = (b.data.selection || []).filter((r) => whole.refs[r]);
  const lines = whole.text.split('\n');
  const sel = picked.length ? `THE DESIGNER HAS SELECTED THIS IN THE EDITOR (help with this only, unless they ask about something else):\n${picked.map((r) => lines.find((l) => l.includes(`[${r}]`))?.trim()).filter(Boolean).join('\n')}\n\n` : '';
  const system = `${persona(client)}

${standard}

THE GUIDE AS IT IS NOW, WITH REFERENCES:
${map.text}

${notes}

${sel}In this conversation: answer in short paragraphs or a short list. When you point at text, write its reference as [[go:C2.S4.heading]] so the designer can jump to it. If you suggest wording, give it on its own line. Ask one question at a time.`;
  const stream = studioAnthropic().messages.stream({ model: MODEL, max_tokens: 1500, system, messages: b.data.messages });
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      try { for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') controller.enqueue(enc.encode(ev.delta.text)); }
      catch (e) { controller.enqueue(enc.encode(/api[_ ]key|authentication/i.test(String(e)) ? '\n\nThe studio’s AI key isn’t set up.' : '\n\nThe connection dropped. Try again.')); }
      controller.close();
    }
  }), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
