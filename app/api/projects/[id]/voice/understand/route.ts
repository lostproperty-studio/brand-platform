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
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'project'); if (gate) return gate; }
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

    const res = await callTool<Partial<VoiceCoach>>(studioAnthropic(), {
      model: 'claude-opus-5-5', max_tokens: 8000,
      system: `You help a brand studio turn its tone-of-voice notes for ${p.client} into guidance an AI can follow when writing for the brand.
Rules:
- Codify only what the notes say. Keep their examples word for word. Tidy and structure; never add traits, principles, messages or claims of your own.
- Where an answer the AI needs is missing or unclear, ask one plain question. Ask only what's genuinely needed for writing on brand: skip anything the notes already make clear or that won't change the writing. At most 6 questions, most important first.
- For each question, offer three short candidate answers or example lines for the studio to react to. Make them specific to this brand, from what it is and what the notes already say, never generic. Make the three genuinely different so the choice teaches you something. They are suggestions for the studio to accept or reject, not the voice.
- UK English. Plain, short sentences.`,
      messages: [{ role: 'user', content: `WHAT WE KNOW ABOUT THE BRAND\n${brand}\n\n${answered.length ? `ALREADY ANSWERED BY THE STUDIO (don't codify or ask these again)\n${answered.map((f) => `- ${f.label}: ${v.fields![f.id].trim().slice(0, 600)}`).join('\n')}\n\n` : ''}THE ANSWERS STILL OPEN\n${fieldList}\n\nTHE NOTES\n${notes.slice(0, 60_000)}` }],
      tool: { name: 'reading', description: 'How you read the notes', input_schema: { type: 'object', properties: {
        summary: { type: 'string', description: 'Two to four sentences: how you understand the voice from the notes, in plain words' },
        codified: { type: 'array', description: 'Open answers the notes cover, codified from the notes only', items: { type: 'object', properties: { field: { type: 'string', enum: open.map((f) => f.id) }, text: { type: 'string', description: 'The answer, keeping the notes\' words and examples; one item per line for lists' } }, required: ['field', 'text'] } },
        questions: { type: 'array', items: { type: 'object', properties: { field: { type: 'string', enum: open.map((f) => f.id) }, question: { type: 'string' }, why: { type: 'string', description: 'One short line: why the AI needs this' }, options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3 } }, required: ['field', 'question', 'options'] } }
      }, required: ['summary', 'codified', 'questions'] } }
    });
    const got = res.input || {};
    if (!res.input) throw new Error('The AI didn’t return a reading. Try again.');
    const ok = new Set(open.map((f) => f.id));
    const coach: VoiceCoach = {
      at: new Date().toISOString(), summary: String(got.summary || '').trim(),
      codified: (got.codified || []).filter((c) => ok.has(c.field) && c.text?.trim()).map((c) => ({ field: c.field, text: c.text.trim() })),
      questions: (got.questions || []).filter((q) => ok.has(q.field) && q.question).slice(0, 6).map((q) => ({ field: q.field, question: q.question, why: q.why, options: (q.options || []).filter(Boolean).slice(0, 3) }))
    };
    // Questions about answers the notes already cover aren't needed
    coach.questions = coach.questions.filter((q) => !coach.codified.some((c) => c.field === q.field));
    // Keep it with the voice, so it's still there next time
    const { data: cur } = await sb.from('projects').select('content').eq('id', id).maybeSingle();
    const content = (cur?.content as Record<string, unknown>) || {};
    await sb.from('projects').update({ content: { ...content, voice: { ...readVoice(content), coach } } }).eq('id', id);
    return NextResponse.json({ coach });
  } catch (e) {
    const m = String((e as Error)?.message || e);
    return NextResponse.json({ error: /api[_ ]?key|authentication|401/i.test(m) ? 'The studio’s AI key isn’t working. Check it in Vercel.' : /overloaded|529|rate/i.test(m) ? 'The AI is busy. Try again in a minute.' : `Couldn’t read the notes: ${m.slice(0, 200)}` }, { status: 500 });
  }
}
