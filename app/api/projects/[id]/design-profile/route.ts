import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { readDesignProfile, readProfile, SETTING_INFO, type SettingKey } from '@/lib/designProfile';

export const maxDuration = 180;

// The design profile: read the guidelines again (POST), or correct, lock or switch off a setting (PATCH).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'guidelines'); if (gate) return gate; }
  try { return NextResponse.json({ profile: await readDesignProfile(id) }); }
  catch (e) { const m = String((e as Error).message || e); return NextResponse.json({ error: /api[_ ]key|authentication/i.test(m) ? 'The studio’s AI key isn’t set up (ANTHROPIC_API_KEY).' : m.slice(0, 300) }, { status: 500 }); }
}

const Patch = z.object({ key: z.string(), value: z.unknown().optional(), locked: z.boolean().optional(), off: z.boolean().optional() });
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'guidelines'); if (gate) return gate; }
  const b = Patch.safeParse(await req.json().catch(() => ({})));
  if (!b.success || !(b.data.key in SETTING_INFO)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('content').eq('id', id).single();
  const prof = readProfile(p?.content);
  if (!prof) return NextResponse.json({ error: 'Read the guidelines first.' }, { status: 400 });
  const k = b.data.key as SettingKey;
  const cur = prof.settings[k] as { value: unknown; source: unknown; locked?: boolean; off?: boolean };
  // An edited value is the studio's: it's locked so a re-read keeps it
  const next = { ...cur, ...(b.data.value !== undefined ? { value: b.data.value, source: { from: 'studio' }, locked: true } : {}), ...(b.data.locked !== undefined ? { locked: b.data.locked } : {}), ...(b.data.off !== undefined ? { off: b.data.off } : {}) };
  const profile = { ...prof, settings: { ...prof.settings, [k]: next } };
  await sb.from('projects').update({ content: { ...((p?.content as object) || {}), dsProfile: profile } }).eq('id', id);
  return NextResponse.json({ profile });
}
