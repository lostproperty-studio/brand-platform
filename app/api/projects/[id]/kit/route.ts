import { teamGate } from '@/lib/studioTeam';
import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/supabase/server';
import { syncKit } from '@/lib/kit/sync';

export const maxDuration = 300;

// Generates the kit, commits it to the project's repository and refreshes the kit downloads.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'kit'); if (gate) return gate; }
  const { searchParams } = new URL(req.url);
  try {
    return NextResponse.json(await syncKit(id, { direct: searchParams.get('direct') === '1', reason: searchParams.get('reason') === 'assets' ? 'assets' : 'manual' }));
  } catch (e) {
    return NextResponse.json({ error: `GitHub didn’t take the update: ${(e as Error).message}` }, { status: 502 });
  }
}
