import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { portalV2 } from '@/lib/portalVersion';
import { portalAnthropic } from '@/lib/ai/project';
import { callTool } from '@/lib/ai/tool';
import { aiFailure } from '@/lib/ai/errors';
import { cleanPreset, describe, DEFAULT_LOGO, DEFAULT_TYPE, EASES, type MotionPreset, type TypePreset } from '@/lib/motion/model';

export const maxDuration = 60;

// Claude as the studio's motion partner: the team says how it should feel ("slower wipe, more drift, harder ease
// out") and Claude changes the settings, explaining what it changed. The team sees it at once and keeps or undoes it.
const Body = z.object({
  target: z.enum(['logo', 'type']),
  preset: z.record(z.unknown()),
  /** Which logo they're looking at, and its parts, so Claude can judge the stagger */
  subject: z.string().max(200).default(''),
  parts: z.number().int().min(1).max(200).default(1),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) })).max(20).default([]),
  message: z.string().min(1).max(2000)
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!portalV2()) return new Response('Not found', { status: 404 });
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'motion'); if (gate) return gate; }
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const q = b.data;
  const { data: p } = await adminClient().from('projects').select('client').eq('id', id).single();
  const base = q.target === 'logo' ? DEFAULT_LOGO : DEFAULT_TYPE;
  const cur = cleanPreset(q.preset as Partial<MotionPreset>, base as MotionPreset);
  const { ai, studio } = await portalAnthropic(id, true);
  const props: Record<string, object> = {
    build: { type: 'string', enum: ['wipe', 'fade', 'rise', 'scale', 'none'] }, from: { type: 'string', enum: ['left', 'right', 'top', 'bottom'], description: 'Where a wipe starts or a rise comes from' },
    split: { type: 'string', enum: q.target === 'logo' ? ['whole', 'parts'] : ['whole', 'lines', 'words', 'letters'] }, order: { type: 'string', enum: ['left', 'right', 'centre', 'top'] },
    length: { type: 'number', description: 'Seconds, 0.6 to 8' }, wipe: { type: 'number', description: 'Each part’s build in ms, at refLength' }, stagger: { type: 'number', description: 'ms between parts, at refLength' }, delay: { type: 'number' },
    drift: { type: 'number', description: '% of width, 0 to 40' }, driftTo: { type: 'string', enum: ['left', 'right', 'top', 'bottom'] },
    ease: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4, description: 'cubic-bezier x1 y1 x2 y2' }, out: { type: 'string', enum: ['none', 'mirror', 'fade'] },
    ...(q.target === 'logo' ? { scale: { type: 'number', description: 'Size as % of frame width, 8 to 100' } } : {}), refLength: { type: 'number', description: 'Keep equal to length unless asked' }
  };
  try {
    const res = await callTool<{ changes: Record<string, unknown>; reply: string }>(ai, {
      model: 'claude-sonnet-5-5', max_tokens: 1500,
      system: `You are a motion designer at Lost Property Studio, setting how ${p?.client || 'the client'}'s ${q.target === 'logo' ? 'logos' : 'type'} move. The studio team tells you how it should feel; you change the settings to get there.
Taste: restrained, precise, confident. Prefer one or two clear changes over many. Eases: ${EASES.map((e) => `${e.label} [${e.ease.join(', ')}]`).join('; ')}. Timings belong to refLength and scale with length, so to slow the whole thing make it longer; to change the character, change wipe, stagger or ease.
Only include settings you change. Reply in one or two short sentences, plainly, saying what you changed and why.`,
      messages: [
        ...q.history.map((h) => ({ role: h.role, content: h.text })),
        { role: 'user', content: `Now: ${describe(cur)}\nSettings: ${JSON.stringify(cur)}\n${q.subject ? `Looking at: ${q.subject} (${q.parts} part${q.parts === 1 ? '' : 's'})\n` : ''}\n${q.message}` }
      ],
      tool: { name: 'set_motion', description: 'Change the motion settings', input_schema: { type: 'object', properties: { changes: { type: 'object', properties: props }, reply: { type: 'string' } }, required: ['changes', 'reply'] } }
    });
    const next = cleanPreset({ ...cur, ...(res.input?.changes || {}) } as Partial<MotionPreset>, cur as MotionPreset) as MotionPreset | TypePreset;
    return NextResponse.json({ preset: next, reply: res.input?.reply || 'Done.' });
  } catch (e) {
    return NextResponse.json({ error: await aiFailure(id, e, studio) }, { status: 502 });
  }
}
