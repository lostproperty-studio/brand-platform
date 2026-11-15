import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { portalV2 } from '@/lib/portalVersion';
import { cleanPreset, CONTROLS, DEFAULT_LOGO, DEFAULT_TYPE, readDraft, type BrandMotion, type Control, type MotionPreset, type TypePreset } from '@/lib/motion/model';

// The studio's motion draft for a project: what moves, the brief, the logo and type behaviours, each logo's and
// typeface's own changes, and the qualities shown in Explore. Saved as content.motionDraft; clients only ever see what
// a lead submits (./submit). Staging only for now (PORTAL_V2).
const Rec = z.record(z.record(z.unknown()));
const Body = z.object({
  logo: z.record(z.unknown()), type: z.record(z.unknown()), perLogo: Rec.default({}), typeBy: Rec.default({}),
  assets: z.object({ logos: z.array(z.string().max(400)).max(120), fonts: z.array(z.string().max(60)).max(20) }).optional(),
  brief: z.string().max(4000).optional(), note: z.string().max(4000).optional(),
  controls: z.array(z.string()).max(20).optional(),
  source: z.object({ kind: z.enum(['claude', 'hand', 'kit', 'video']), name: z.string().max(200).optional(), at: z.string().max(40) }).optional(),
  builtAt: z.string().max(40).optional()
});

/** Keeps only the settings that differ from the base */
function diffs<T extends object>(full: T, base: T) { return Object.fromEntries(Object.entries(full).filter(([f, x]) => JSON.stringify(x) !== JSON.stringify(base[f as keyof T]))); }

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
  const cur = readDraft(content);
  const d = b.data;
  const logo = cleanPreset(d.logo as Partial<MotionPreset>, DEFAULT_LOGO);
  const type = cleanPreset(d.type as Partial<TypePreset>, DEFAULT_TYPE);
  const perLogo = Object.fromEntries(Object.entries(d.perLogo).slice(0, 120).map(([k, v]) => [k, diffs(cleanPreset({ ...logo, ...v } as Partial<MotionPreset>, logo), logo)]).filter(([, v]) => Object.keys(v as object).length));
  const typeBy = Object.fromEntries(Object.entries(d.typeBy).slice(0, 20).map(([k, v]) => [k, diffs(cleanPreset({ ...type, ...v } as Partial<TypePreset>, type), type)]).filter(([, v]) => Object.keys(v as object).length));
  const ok = new Set(CONTROLS.map((c) => c.id));
  const draft: BrandMotion = {
    logo, type, perLogo, typeBy,
    assets: d.assets ?? cur.assets, brief: d.brief ?? cur.brief, note: d.note ?? cur.note,
    controls: d.controls ? d.controls.filter((c): c is Control => ok.has(c as Control)) : cur.controls,
    source: d.source ?? cur.source, builtAt: d.builtAt ?? cur.builtAt,
    status: 'draft', version: cur.version, submittedAt: cur.submittedAt, updatedAt: new Date().toISOString()
  };
  const { error } = await sb.from('projects').update({ content: { ...content, motionDraft: draft } }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ motion: draft });
}
