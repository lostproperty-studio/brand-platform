import { NextResponse } from 'next/server';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { studioAnthropic } from '@/lib/ai/studio';
import { callTool } from '@/lib/ai/tool';
import { buildSnapshot } from '@/lib/projects/snapshot';
import { aboutMd } from '@/lib/brandForm';
import { notesText, readVoice, VOICE_FIELDS, type VoiceCoach } from '@/lib/voice';

export const maxDuration = 300;

// Reads the studio's voice notes and says back how it understands them: a short summary, the notes codified into
// the answers an AI needs (from the notes only), and just the questions still worth asking, each with a few
// candidate lines drawn from what the brand is, for the studio to pick from or replace. Nothing is saved as the
// voice until the studio keeps it.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'project'); if (gate) return gate; }
  const more = !!(await req.json().catch(() => ({})) as { more?: boolean }).more;
  try {
    const sb = adminClient();
    const { data: p } = await sb.from('projects').select('client, content').eq('id', id).maybeSingle();
    if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const v = readVoice(p.content);
    const notes = notesText(v.notes || '');
    if (notes.length < 40) return NextResponse.json({ error: 'Write or paste a little more of the voice work first.' }, { status: 400 });
    const snap = await buildSnapshot(id).catch(() => null);
    // What the brand is, so suggestions fit it (a creative community and a bathhouse don't sound alike)
    const brand = snap ? [`${snap.client}: ${snap.line}`, aboutMd(snap.form), ...(snap.design || []).slice(0, 8).map((d) => `- ${d}`),
      ...snap.chapters.filter((c) => !/voice|tone|verbal|writ/i.test(c.title)).flatMap((c) => c.rules.slice(0, 6).map((r) => `- ${c.title}: ${r.text}`)).slice(0, 40)].filter(Boolean).join('\n').slice(0, 12_000) : p.client;
    const answered = VOICE_FIELDS.filter((f) => v.fields?.[f.id]?.trim());
    const open = VOICE_FIELDS.filter((f) => !v.fields?.[f.id]?.trim());
    const fieldList = open.map((f) => `- ${f.id} (${f.label}${f.core ? ', needed' : ''}): ${f.ask}`).join('\n');
    // Another round: questions may sharpen any answer, and don't repeat what's been asked
    const askable = more ? VOICE_FIELDS : open;
    const asked = (v.asked || []).slice(-60);

    const res = await callTool<Partial<VoiceCoach>>(studioAnthropic(), {
      model: 'claude-opus-5-5', max_tokens: 8000,
      system: `You help a brand studio turn its tone-of-voice notes for ${p.client} into guidance an AI can follow when writing for the brand.
Rules:
- Codify only what the notes say. Keep their examples word for word. Tidy and structure; never add traits, principles, messages or claims of your own.
- ${more ? 'This is another round: ask questions that sharpen the voice further, about anything, including answers already given. Never repeat a question already asked.' : 'Where an answer the AI needs is missing or unclear, ask a question. Ask only what will change the writing: skip anything the notes already make clear.'} At most 6 questions, most important first.
- Make every question concrete and quick to answer, never abstract. Use the format that fits the decision, and mix them:
  · choice: three short lines written in the possible voice; the studio picks the one that sounds most like the brand. Good for principles, examples, tone.
  · slider: two qualities in tension (left and right, one or two words each, e.g. "Playful" and "Serious"); the studio sets where the voice sits.
  · pick: two words for the same thing (a and b, e.g. "community" and "customers"); the studio picks the brand's word.
  · swap: three to five common words in this category, each with the word the brand might use instead; the studio keeps the swaps that are right.
  · never: five to eight words or phrases common in this category that might be off brand; the studio ticks the ones to ban.
- Make every candidate specific to this brand and its category, from what it is and what the notes say. Never generic. They are suggestions for the studio to accept or reject, not the voice.
- UK English. Plain, short sentences.`,
      messages: [{ role: 'user', content: `WHAT WE KNOW ABOUT THE BRAND\n${brand}\n\n${answered.length ? `ALREADY ANSWERED BY THE STUDIO (don't codify or ask these again)\n${answered.map((f) => `- ${f.label}: ${v.fields![f.id].trim().slice(0, 600)}`).join('\n')}\n\n` : ''}THE ANSWERS STILL OPEN\n${fieldList || '(none)'}\n\n${asked.length ? `ALREADY ASKED (don't repeat)\n${asked.map((x) => `- ${x}`).join('\n')}\n\n` : ''}THE NOTES\n${notes.slice(0, 60_000)}` }],
      tool: { name: 'reading', description: 'How you read the notes', input_schema: { type: 'object', properties: {
        summary: { type: 'string', description: 'Two to four sentences: how you understand the voice from the notes, in plain words' },
        codified: { type: 'array', description: 'Open answers the notes cover, codified from the notes only', items: { type: 'object', properties: { field: { type: 'string', enum: open.map((f) => f.id) }, text: { type: 'string', description: 'The answer, keeping the notes\' words and examples; one item per line for lists' } }, required: ['field', 'text'] } },
        questions: { type: 'array', items: { type: 'object', properties: {
          field: { type: 'string', enum: askable.map((f) => f.id), description: 'The answer this decides' },
          type: { type: 'string', enum: ['choice', 'slider', 'pick', 'swap', 'never'] },
          question: { type: 'string', description: 'Short and concrete' }, why: { type: 'string', description: 'One short line: why the AI needs this' },
          options: { type: 'array', items: { type: 'string' }, description: 'choice: three lines' },
          left: { type: 'string', description: 'slider: the quality on the left' }, right: { type: 'string', description: 'slider: the quality on the right' },
          a: { type: 'string', description: 'pick: one word' }, b: { type: 'string', description: 'pick: the other word' },
          swaps: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] }, description: 'swap: common word and the brand\'s word' },
          words: { type: 'array', items: { type: 'string' }, description: 'never: candidate words or phrases to ban' }
        }, required: ['field', 'type', 'question'] } }
      }, required: ['summary', 'codified', 'questions'] } }
    });
    const got = res.input || {};
    if (!res.input) throw new Error('The AI didn’t return a reading. Try again.');
    const ok = new Set(open.map((f) => f.id)), okQ = new Set(askable.map((f) => f.id));
    const coach: VoiceCoach = {
      at: new Date().toISOString(), summary: String(got.summary || '').trim(),
      codified: (got.codified || []).filter((c) => ok.has(c.field) && c.text?.trim()).map((c) => ({ field: c.field, text: c.text.trim() })),
      questions: (got.questions || []).filter((q) => okQ.has(q.field) && q.question).map((q) => ({ field: q.field, type: q.type, question: q.question, why: q.why,
        options: (q.options || []).filter(Boolean).slice(0, 3), left: q.left, right: q.right, a: q.a, b: q.b, swaps: (q.swaps || []).filter((x) => x?.from && x?.to).slice(0, 6), words: (q.words || []).filter(Boolean).slice(0, 10) }))
        // Keep only questions with what their format needs
        .filter((q) => q.type === 'slider' ? q.left && q.right : q.type === 'pick' ? q.a && q.b : q.type === 'swap' ? q.swaps.length : q.type === 'never' ? q.words.length : q.options.length >= 2)
        .slice(0, 6)
    };
    // Questions about answers the notes already cover aren't needed
    coach.questions = coach.questions.filter((q) => !coach.codified.some((c) => c.field === q.field));
    // Keep it with the voice, so it's still there next time
    const { data: cur } = await sb.from('projects').select('content').eq('id', id).maybeSingle();
    const content = (cur?.content as Record<string, unknown>) || {};
    const prev = readVoice(content);
    await sb.from('projects').update({ content: { ...content, voice: { ...prev, coach, asked: [...(prev.asked || []), ...coach.questions.map((q) => q.question)].slice(-80) } } }).eq('id', id);
    return NextResponse.json({ coach });
  } catch (e) {
    const m = String((e as Error)?.message || e);
    return NextResponse.json({ error: /api[_ ]?key|authentication|401/i.test(m) ? 'The studio’s AI key isn’t working. Check it in Vercel.' : /overloaded|529|rate/i.test(m) ? 'The AI is busy. Try again in a minute.' : `Couldn’t read the notes: ${m.slice(0, 200)}` }, { status: 500 });
  }
}
