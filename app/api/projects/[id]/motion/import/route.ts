import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { portalV2Studio } from '@/lib/portalVersionServer';
import { portalAnthropic } from '@/lib/ai/project';
import { callTool } from '@/lib/ai/tool';
import { aiFailure } from '@/lib/ai/errors';
import { cleanPreset, CONTROLS, DEFAULT_LOGO, DEFAULT_TYPE, type Control, type MotionPreset, type TypePreset } from '@/lib/motion/model';
import { controlEnum, MOTION_TASTE, presetSchema } from '@/lib/motion/ai';

export const maxDuration = 120;

// Import: motion built off the platform. Claude reads an HTML motion kit (its timings, eases and masks), or watches
// frames from a video of the logo moving, and turns it into the Motion tab's settings.
const Body = z.object({
  kind: z.enum(['kit', 'video']),
  name: z.string().max(200).default(''),
  /** The kit's HTML */
  text: z.string().max(600_000).optional(),
  /** Frames from the video: seconds in, and a JPEG as base64 */
  frames: z.array(z.object({ t: z.number(), data: z.string().max(400_000) })).max(20).optional(),
  duration: z.number().optional(),
  logos: z.array(z.object({ name: z.string().max(200), parts: z.number().int() })).max(60).default([]),
  fonts: z.array(z.object({ role: z.string().max(60), name: z.string().max(120) })).max(20).default([])
});

/** Keeps the parts of a kit that say how it moves: big embedded files are cut out, and very long kits are trimmed */
function slim(html: string) {
  return html.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{200,}/gi, 'data:…').replace(/(<path[^>]*\sd=")[^"]{400,}"/g, '$1…"').slice(0, 160_000);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  if (!(await portalV2Studio(id))) return new Response('Not found', { status: 404 });
  { const gate = await teamGate(id, st, 'editor', 'motion'); if (gate) return gate; }
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const q = b.data;
  if (q.kind === 'kit' && !q.text?.trim()) return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  if (q.kind === 'video' && !q.frames?.length) return NextResponse.json({ error: 'No frames came through from the video.' }, { status: 400 });
  const { data: p } = await adminClient().from('projects').select('client').eq('id', id).single();
  const { ai, studio } = await portalAnthropic(id, true);
  const context = `Logos in the Motion tab: ${q.logos.map((l) => `${l.name} (${l.parts} parts)`).join('; ') || 'none'}\nTypefaces: ${q.fonts.map((f) => `${f.name} (${f.role})`).join('; ') || 'none'}`;
  type Content = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } };
  const content: Content[] = q.kind === 'kit'
    ? [{ type: 'text', text: `${context}\n\nThe motion kit, ${q.name || 'an HTML file'}:\n\n${slim(q.text!)}` }]
    : [{ type: 'text', text: `${context}\n\nFrames from ${q.name || 'a video'}${q.duration ? `, ${q.duration.toFixed(1)} s long` : ''}, in order:` },
       ...q.frames!.flatMap((f): Content[] => [{ type: 'text', text: `${f.t.toFixed(2)} s` }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data.replace(/^data:image\/\w+;base64,/, '') } }])];
  try {
    const res = await callTool<{ logo: Record<string, unknown>; type: Record<string, unknown>; controls: string[]; summary: string; unsure: string }>(ai, {
      model: 'claude-opus-5-5', max_tokens: 3000,
      system: `You are a motion designer at Lost Property Studio, bringing ${p?.client || 'a client'}'s approved motion into the studio's Motion tab, so it can be built into files, guidelines and tools.
${MOTION_TASTE}
${q.kind === 'kit' ? 'Read the kit carefully: find the real durations, staggers, delays, eases (cubic-bezier values), masks or clip paths, drift and transforms, and how it leaves. Use its exact numbers. If it treats the logo in parts (tiles, letters), use split parts.' : 'Watch the frames: work out how each part arrives (wipe, drawn on, fade, scale, blur, movement), the order, how long each takes and the gap between, whether it drifts, the feel of the ease, and how it leaves. Estimate timings from the timestamps.'}
If the kit has no type behaviour, give type the same character as the logo, split into words. Summarise what you found in two or three plain sentences for a creative director, and say anything you weren't sure of.`,
      messages: [{ role: 'user', content }],
      tool: { name: 'set_imported_motion', description: 'The motion, as settings', input_schema: { type: 'object', properties: { logo: presetSchema('logo'), type: presetSchema('type'), controls: { ...controlEnum, description: 'The qualities that define this motion, for Explore' }, summary: { type: 'string' }, unsure: { type: 'string', description: 'Anything that was a guess, or empty' } }, required: ['logo', 'type', 'controls', 'summary'] } }
    });
    const r = res.input; if (!r) throw new Error('Claude couldn’t read that.');
    const ok = new Set(CONTROLS.map((c) => c.id));
    return NextResponse.json({
      logo: cleanPreset({ ...r.logo, refLength: r.logo.length } as Partial<MotionPreset>, DEFAULT_LOGO),
      type: cleanPreset({ ...r.type, refLength: r.type.length } as Partial<TypePreset>, DEFAULT_TYPE),
      controls: (r.controls || []).filter((c): c is Control => ok.has(c as Control)),
      summary: r.summary || '', unsure: r.unsure || ''
    });
  } catch (e) {
    return NextResponse.json({ error: await aiFailure(id, e, studio) }, { status: 502 });
  }
}
