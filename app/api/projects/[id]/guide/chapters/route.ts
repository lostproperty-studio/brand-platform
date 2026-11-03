import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { scanChapters } from '@/lib/portal/chapterScan';

export const maxDuration = 120;

// The chapters the guidelines file has, so the studio can choose which to bring in
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'guidelines'); if (gate) return gate; }
  try { return NextResponse.json(await scanChapters(id)); }
  catch (e) { return NextResponse.json({ error: String((e as Error).message || e).slice(0, 300) }, { status: 500 }); }
}
