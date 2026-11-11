import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { importFigmaLayout, listFigmaLayouts } from '@/lib/portal/figmaLayouts';

export const maxDuration = 60;

// The layouts in the project's Figma guidelines, with previews, for "Add from Figma" in the section picker
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'guidelines'); if (gate) return gate; }
  try { return NextResponse.json(await listFigmaLayouts(id)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Couldn’t read the Figma file.' }, { status: 400 }); }
}

// One layout made into a section, its pictures stored; the editor inserts it where it was asked for
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'guidelines'); if (gate) return gate; }
  const body = await req.json().catch(() => null) as { frameId?: string } | null;
  if (!body?.frameId || typeof body.frameId !== 'string') return NextResponse.json({ error: 'Choose a layout.' }, { status: 400 });
  try { return NextResponse.json(await importFigmaLayout(id, body.frameId)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Couldn’t import that layout.' }, { status: 400 }); }
}
