import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/supabase/server';
import { buildGuide } from '@/lib/portal/guide';
import { draftGaps } from '@/lib/portal/drafts';

export const maxDuration = 300;

// Builds (or rebuilds) the client-facing guidelines from the Figma page, then checks them against the project's tier
// and drafts the gaps. Studio edits, accepted drafts and hand-added sections are kept.
export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  try {
    const guide = await buildGuide(id);
    const gaps = await draftGaps(id).catch((e) => ({ tier: null, drafts: 0, missing: 0, error: String((e as Error).message || e).slice(0, 200) }));
    return NextResponse.json({ ok: true, chapters: guide.chapters.length, frames: guide.chapters.reduce((n, c) => n + c.blocks.filter((b) => b.source).length, 0), colours: guide.colours.length, gaps });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message || e).slice(0, 300) }, { status: 500 });
  }
}
