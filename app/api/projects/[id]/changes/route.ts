import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { byArea, changeFeed } from '@/lib/projects/changes';

export const dynamic = 'force-dynamic';

// What's waiting to be published, for the Publish button to stay current while the studio edits (the guidelines
// editor saves as you type, without reloading the page)
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'viewer'); if (gate) return gate; }
  const feed = await changeFeed(id);
  return NextResponse.json({ live: feed.live ? { version: feed.live.version, at: feed.live.at, by: feed.live.by } : null, pending: byArea(feed.pending) });
}
