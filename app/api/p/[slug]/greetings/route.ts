import { NextResponse } from 'next/server';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { buildSnapshot, projectBySlug } from '@/lib/projects/snapshot';
import { portalAnthropic, logUsage } from '@/lib/ai/project';
import { callTool } from '@/lib/ai/tool';
import { voiceHas, voiceMd } from '@/lib/voice';
import { BANDS, BAND_LABEL, type GreetingSet } from '@/lib/portal/greetings';
import { portalV2 } from '@/lib/portalVersion';

export const maxDuration = 120;

// Portal v2: the studio writes the home page's greetings from the brand's voice, once, and they're saved to the
// project. Studio staff only; the client just sees the result.
export async function POST(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  if (!portalV2()) return new Response('Not found', { status: 404 });
  const p = await projectBySlug((await ctx.params).slug);
  if (!p) return new Response('Not found', { status: 404 });
  const acc = await requireProjectAccess(p.id);
  if (acc instanceof Response) return acc;
  if (!acc.staff) return NextResponse.json({ error: 'Only the studio can do this.' }, { status: 403 });
  const snap = await buildSnapshot(p.id);
  const v = snap?.voice;
  if (!snap || !v || !voiceHas(v)) return NextResponse.json({ error: 'Add the voice work in the studio’s Voice tab first.' }, { status: 409 });
  try {
  const { ai } = await portalAnthropic(p.id, true);
  const lines = { type: 'array', minItems: 2, maxItems: 4, items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string' } } };
  const res = await callTool<GreetingSet>(ai, {
    model: 'claude-sonnet-5-5', max_tokens: 3000,
    system: `You write the greeting on the home page of ${snap.client}'s brand portal, in the ${snap.client} voice.\n\n${voiceMd(snap.client, v)}`,
    messages: [{ role: 'user', content: `Write greetings for each time of day: ${BANDS.map((b) => BAND_LABEL[b]).join(', ')}. Each greeting is a pair: a short hello to the person (use {name} for their first name, e.g. "Morning, {name}.") and a headline of six words or fewer that asks what they'll make or do, fitting that moment. Human, warm and specific to this brand's world, the way the voice would say it; borrow its phrases where they fit. No exclamation marks unless the voice uses them. Give 2 to 4 pairs per time of day.` }],
    tool: { name: 'greetings', description: 'Greetings by time of day', input_schema: { type: 'object', properties: Object.fromEntries(BANDS.map((b) => [b, lines])), required: BANDS } }
  });
  await logUsage(p.id, acc.user.id, 'writer', res.usage).catch(() => {});
  if (!res.input) return NextResponse.json({ error: 'Couldn’t write them this time. Try again.' }, { status: 502 });
  const sb = adminClient();
  const { data: cur } = await sb.from('projects').select('content').eq('id', p.id).single();
  await sb.from('projects').update({ content: { ...((cur?.content as object) || {}), portalGreetings: res.input } }).eq('id', p.id);
  return NextResponse.json({ greetings: res.input });
  } catch (e) {
    // Say what went wrong (usually a missing or wrong AI key on this site), rather than a blank failure
    return NextResponse.json({ error: `Couldn’t write them: ${e instanceof Error ? e.message : 'the AI didn’t answer'}.` }, { status: 502 });
  }
}
