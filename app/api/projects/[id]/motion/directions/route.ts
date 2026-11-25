import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { portalV2Studio } from '@/lib/portalVersionServer';
import { portalAnthropic } from '@/lib/ai/project';
import { publishedSnapshot } from '@/lib/projects/snapshot';
import { callTool } from '@/lib/ai/tool';
import { aiFailure } from '@/lib/ai/errors';
import { cleanPreset, CONTROLS, DEFAULT_LOGO, DEFAULT_TYPE, type Control, type MotionPreset, type TypePreset } from '@/lib/motion/model';
import { controlEnum, MOTION_TASTE, presetSchema } from '@/lib/motion/ai';

export const maxDuration = 90;

// Describe: the team says how the brand should move, in their words. Claude answers with three distinct directions,
// each set on the chosen logos and type, and asks which qualities they want to play with to land it.
const Body = z.object({
  brief: z.string().min(2).max(4000),
  logos: z.array(z.object({ name: z.string().max(200), parts: z.number().int().min(1).max(200) })).max(60).default([]),
  fonts: z.array(z.object({ role: z.string().max(60), name: z.string().max(120) })).max(20).default([]),
  /** Directions already shown, so "more like the second" or "something different" works */
  previous: z.array(z.string().max(400)).max(9).default([])
});
type Dir = { name: string; about: string; logo: Record<string, unknown>; type: Record<string, unknown>; controls: string[] };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  if (!(await portalV2Studio(id))) return new Response('Not found', { status: 404 });
  { const gate = await teamGate(id, st, 'editor', 'motion'); if (gate) return gate; }
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const q = b.data;
  const { data: p } = await adminClient().from('projects').select('client').eq('id', id).single();
  const snap = await publishedSnapshot(id).catch(() => null);
  const { ai, studio } = await portalAnthropic(id, true);
  const dir = { type: 'object', properties: { name: { type: 'string', description: 'Two or three words' }, about: { type: 'string', description: 'One sentence: what it feels like and why it suits the brief' }, logo: presetSchema('logo'), type: presetSchema('type'), controls: { ...controlEnum, description: 'The 3 to 5 qualities most worth playing with for this direction' } }, required: ['name', 'about', 'logo', 'type', 'controls'] };
  try {
    const res = await callTool<{ directions: Dir[]; question: string }>(ai, {
      model: 'claude-opus-5-5', max_tokens: 4000,
      system: `You are a motion designer at Lost Property Studio, finding how ${p?.client || 'the client'}'s logos and type should move.
${snap ? `The brand: ${snap.line}${snap.design?.length ? `\nIts design qualities: ${snap.design.join('; ')}` : ''}` : ''}
${MOTION_TASTE}
Give exactly three directions that are clearly different from each other (different reveals or channels, not just different speeds), all true to the brief. Set every setting you use for each, logo and type. Then ask the team one short question: which qualities they want to play with to land it.`,
      messages: [{ role: 'user', content: `Brief: ${q.brief}\nLogos: ${q.logos.map((l) => `${l.name} (${l.parts} part${l.parts === 1 ? '' : 's'})`).join('; ') || 'none chosen'}\nTypefaces: ${q.fonts.map((f) => `${f.name} (${f.role})`).join('; ') || 'none chosen'}${q.previous.length ? `\nAlready shown (give new ones unless the brief asks to build on one): ${q.previous.join(' | ')}` : ''}` }],
      tool: { name: 'motion_directions', description: 'Three directions and a question', input_schema: { type: 'object', properties: { directions: { type: 'array', items: dir, minItems: 3, maxItems: 3 }, question: { type: 'string' } }, required: ['directions', 'question'] } }
    });
    const ok = new Set(CONTROLS.map((c) => c.id));
    const directions = (res.input?.directions || []).slice(0, 3).map((d) => {
      const logo = cleanPreset({ ...d.logo, refLength: d.logo.length } as Partial<MotionPreset>, DEFAULT_LOGO);
      return { name: String(d.name || 'Direction').slice(0, 60), about: String(d.about || '').slice(0, 400), logo,
        type: cleanPreset({ ...d.type, refLength: d.type.length } as Partial<TypePreset>, DEFAULT_TYPE),
        controls: (d.controls || []).filter((c): c is Control => ok.has(c as Control)).slice(0, 6) };
    });
    if (!directions.length) throw new Error('Claude didn’t suggest any directions.');
    return NextResponse.json({ directions, question: res.input?.question || 'Which qualities do you want to play with?' });
  } catch (e) {
    return NextResponse.json({ error: await aiFailure(id, e, studio) }, { status: 502 });
  }
}
