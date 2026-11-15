import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { portalV2 } from '@/lib/portalVersion';
import { cleanPreset, readMotion, DEFAULT_LOGO, DEFAULT_TYPE, type MotionPreset, type TypePreset } from '@/lib/motion/model';

// The studio's brand motion for a project: the logo behaviour, each logo's own changes, and the type behaviour.
// Staging only for now (PORTAL_V2), like the apps that use it.
const Body = z.object({ logo: z.record(z.unknown()), type: z.record(z.unknown()), perLogo: z.record(z.record(z.unknown())).default({}), note: z.string().max(2000).optional(), builtAt: z.string().max(40).optional() });

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!portalV2()) return new Response('Not found', { status: 404 });
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'motion'); if (gate) return gate; }
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('content').eq('id', id).single();
  const content = (p?.content || {}) as Record<string, unknown>;
  const cur = readMotion(content);
  const logo = cleanPreset(b.data.logo as Partial<MotionPreset>, DEFAULT_LOGO);
  // Each logo keeps only the settings that differ from the brand's
  const perLogo = Object.fromEntries(Object.entries(b.data.perLogo).slice(0, 80).map(([k, v]) => { const full = cleanPreset({ ...logo, ...v } as Partial<MotionPreset>, logo); return [k, Object.fromEntries(Object.entries(full).filter(([f, x]) => JSON.stringify(x) !== JSON.stringify(logo[f as keyof MotionPreset])))]; }).filter(([, v]) => Object.keys(v as object).length));
  const motion = { logo, perLogo, type: cleanPreset(b.data.type as Partial<TypePreset>, DEFAULT_TYPE), note: b.data.note ?? cur.note, builtAt: b.data.builtAt ?? cur.builtAt, updatedAt: new Date().toISOString() };
  const { error } = await sb.from('projects').update({ content: { ...content, motion } }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ motion });
}
