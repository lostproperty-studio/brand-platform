import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { readConnector } from '@/lib/mcp/kit';

// The client's Claude connector, set by the studio: whether it hands out font file links. Off by default, because
// many font licences (Klim's, for one) don't allow passing the files on.
const Body = z.object({ shareFontFiles: z.boolean() });
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'connector'); if (gate) return gate; }
  const b = Body.safeParse(await req.json().catch(() => null)); if (!b.success) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('content').eq('id', id).single();
  const c = (p?.content || {}) as Record<string, unknown>;
  const connector = { ...((c.connector as object) || {}), shareFontFiles: b.data.shareFontFiles };
  const { error } = await sb.from('projects').update({ content: { ...c, connector } }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, settings: readConnector({ connector }) });
}
