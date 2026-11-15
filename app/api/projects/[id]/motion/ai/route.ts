import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { portalV2 } from '@/lib/portalVersion';
import { portalAnthropic } from '@/lib/ai/project';
import { callTool } from '@/lib/ai/tool';
import { aiFailure } from '@/lib/ai/errors';
import { cleanPreset, describe, DEFAULT_LOGO, DEFAULT_TYPE, type MotionPreset, type TypePreset } from '@/lib/motion/model';
import { MOTION_TASTE, presetSchema } from '@/lib/motion/ai';

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
  try {
    const res = await callTool<{ changes: Record<string, unknown>; reply: string }>(ai, {
      model: 'claude-sonnet-5-5', max_tokens: 1500,
      system: `You are a motion designer at Lost Property Studio, setting how ${p?.client || 'the client'}'s ${q.target === 'logo' ? 'logos' : 'type'} move. The studio team tells you how it should feel; you change the settings to get there.
${MOTION_TASTE} Prefer one or two clear changes over many. To slow the whole thing make it longer; to change the character, change wipe, stagger, ease or the channels.
Only include settings you change. Reply in one or two short sentences, plainly, saying what you changed and why.`,
      messages: [
        ...q.history.map((h) => ({ role: h.role, content: h.text })),
        { role: 'user', content: `Now: ${describe(cur)}\nSettings: ${JSON.stringify(cur)}\n${q.subject ? `Looking at: ${q.subject} (${q.parts} part${q.parts === 1 ? '' : 's'})\n` : ''}\n${q.message}` }
      ],
      tool: { name: 'set_motion', description: 'Change the motion settings', input_schema: { type: 'object', properties: { changes: presetSchema(q.target), reply: { type: 'string' } }, required: ['changes', 'reply'] } }
    });
    const next = cleanPreset({ ...cur, ...(res.input?.changes || {}) } as Partial<MotionPreset>, cur as MotionPreset) as MotionPreset | TypePreset;
    return NextResponse.json({ preset: next, reply: res.input?.reply || 'Done.' });
  } catch (e) {
    return NextResponse.json({ error: await aiFailure(id, e, studio) }, { status: 502 });
  }
}
