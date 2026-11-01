import { teamGate } from '@/lib/studioTeam';
import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/supabase/server';
import { draftGaps } from '@/lib/portal/drafts';

export const maxDuration = 300;

// Re-checks the guidelines against the project's tier without reading Figma again (for example after changing the tier).
export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'guidelines'); if (gate) return gate; }
  try {
    return NextResponse.json({ ok: true, ...(await draftGaps(id)) });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message || e).slice(0, 300) }, { status: 500 });
  }
}
