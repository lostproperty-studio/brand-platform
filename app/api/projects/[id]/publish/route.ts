import { NextResponse } from 'next/server';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { buildSnapshot } from '@/lib/projects/snapshot';
import { readFonts } from '@/lib/projects/fonts';
import { fontState, fontsNeedingLicence } from '@/lib/fonts';

// Publishes the client-facing view. Stops first if any typeface is still on trial files (or has none),
// unless the studio confirms with { allowTrialFonts: true }.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({})) as { allowTrialFonts?: boolean };
  const { fonts } = await readFonts(id);
  const pending = fontsNeedingLicence(fonts);
  if (pending.length && !body.allowTrialFonts) {
    return NextResponse.json({
      error: 'Some typefaces don’t have licensed files yet.',
      code: 'trial_fonts',
      fonts: pending.map((f) => ({ label: f.label, name: f.name, state: fontState(f) }))
    }, { status: 409 });
  }
  const sb = adminClient();
  const snapshot = await buildSnapshot(id);
  const { data: p } = await sb.from('projects').select('kit_version').eq('id', id).single();
  await sb.from('project_versions').insert({ project_id: id, version: p?.kit_version || '1.0.0', snapshot, published_by: st.user.id });
  await sb.from('projects').update({ status: 'live', published_at: new Date().toISOString() }).eq('id', id);
  return NextResponse.json({ ok: true, trialFonts: pending.length });
}
