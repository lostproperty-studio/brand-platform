import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/supabase/server';
import { buildGuide } from '@/lib/portal/guide';

export const maxDuration = 300;

// Builds (or rebuilds) the client-facing guidelines from the Figma page. Studio edits to titles and visibility are kept.
export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  try {
    const guide = await buildGuide(id);
    return NextResponse.json({ ok: true, chapters: guide.chapters.length, frames: guide.chapters.reduce((n, c) => n + c.frames.length, 0), colours: guide.colours.length });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message || e).slice(0, 300) }, { status: 500 });
  }
}
