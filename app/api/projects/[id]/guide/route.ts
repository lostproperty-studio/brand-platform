import { teamGate } from '@/lib/studioTeam';
import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/supabase/server';
import { buildGuide, normaliseGuide, type BuildMode, type Guide } from '@/lib/portal/guide';
import { adminClient } from '@/lib/supabase/server';
import { draftGaps } from '@/lib/portal/drafts';

export const maxDuration = 300;

// Builds (or rebuilds) the client-facing guidelines from the Figma page, then checks them against the project's tier
// and drafts the gaps. Studio edits, accepted drafts and hand-added sections are kept.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'guidelines'); if (gate) return gate; }
  try {
    const body = await req.json().catch(() => ({}));
    const mode: BuildMode = ['update', 'add', 'fresh'].includes(body?.mode) ? body.mode : 'update';
    const { data: before } = await adminClient().from('projects').select('content').eq('id', id).single();
    const prev = normaliseGuide((before?.content as { guide?: Guide } | null)?.guide);
    const had = new Set((prev?.chapters || []).flatMap((c) => [c.id, ...c.blocks.map((b) => b.id)]));
    const guide = await buildGuide(id, mode);
    const added = { chapters: guide.chapters.filter((c) => !had.has(c.id)).length, sections: guide.chapters.filter((c) => had.has(c.id)).flatMap((c) => c.blocks).filter((b) => !had.has(b.id)).length };
    const gaps = await draftGaps(id).catch((e) => ({ tier: null, drafts: 0, missing: 0, error: String((e as Error).message || e).slice(0, 200) }));
    return NextResponse.json({ ok: true, mode, added, chapters: guide.chapters.length, frames: guide.chapters.reduce((n, c) => n + c.blocks.filter((b) => b.source).length, 0), colours: guide.colours.length, gaps });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message || e).slice(0, 300) }, { status: 500 });
  }
}
