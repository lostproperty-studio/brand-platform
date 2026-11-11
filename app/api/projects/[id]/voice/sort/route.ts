import { NextResponse } from 'next/server';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { studioAnthropic } from '@/lib/ai/studio';
import { notesText, readVoice, VOICE_FIELDS } from '@/lib/voice';

export const maxDuration = 120;

// Sort the studio's voice notes into the answers the AI needs. It only moves and tidies what the notes already say:
// it never writes strategy. Anything the notes don't cover comes back empty, so the studio fills it in.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'project'); if (gate) return gate; }
  const { data: p } = await adminClient().from('projects').select('client, content').eq('id', id).maybeSingle();
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const v = readVoice(p.content);
  const notes = notesText(v.notes || '');
  if (notes.length < 40) return NextResponse.json({ error: 'Write or paste some notes first.' }, { status: 400 });
  const props = Object.fromEntries(VOICE_FIELDS.map((f) => [f.id, { type: 'string', description: `${f.label}: ${f.ask} Empty string if the notes don't say.` }]));
  const res = await studioAnthropic().messages.create({
    model: 'claude-opus-5-5', max_tokens: 4000,
    system: `You sort a brand studio's notes on ${p.client}'s tone of voice into a set of answers. Use only what the notes say: quote or tidy their words, keep their examples exactly, keep line breaks for lists. Never add, invent or improve strategy, traits, principles, messages or examples. If the notes don't cover an answer, return an empty string for it. UK English.`,
    messages: [{ role: 'user', content: `THE NOTES\n\n${notes.slice(0, 60_000)}` }],
    tools: [{ name: 'answers', description: 'The answers, from the notes only', input_schema: { type: 'object', properties: props, required: VOICE_FIELDS.map((f) => f.id) } }],
    tool_choice: { type: 'tool', name: 'answers' }
  });
  const out = res.content.find((c) => c.type === 'tool_use');
  const got = (out && out.type === 'tool_use' ? out.input : {}) as Record<string, string>;
  // Only suggest where the studio hasn't written an answer yet; never overwrite
  const suggestions = Object.fromEntries(VOICE_FIELDS.map((f) => [f.id, String(got[f.id] || '').trim()]).filter(([k, t]) => t && !v.fields?.[k]?.trim()));
  return NextResponse.json({ suggestions });
}
