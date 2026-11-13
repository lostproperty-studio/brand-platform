import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { nameOf } from '@/lib/guideVersions';

// Comments on the studio preview of the portal: left by the studio, seen in the guidelines editor, resolved there or
// on the page. Clients never see them.
const MISSING = 'Comments need a one-off database update (migration 0009_comments.sql).';
const COLS = 'id, path, chapter, block, x, y, body, author, author_name, replies, resolved_at, resolved_by, created_at';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'viewer', 'project'); if (gate) return gate; }
  const { data, error } = await adminClient().from('portal_comments').select(COLS).eq('project_id', id).order('created_at', { ascending: true }).limit(500);
  if (error) return NextResponse.json({ comments: [], error: MISSING });
  return NextResponse.json({ comments: data || [], me: st.user.id });
}

const New = z.object({ path: z.string().max(300), chapter: z.string().max(200).nullable().optional(), block: z.string().max(200).nullable().optional(), x: z.number().min(0).max(1), y: z.number().min(0).max(1), body: z.string().trim().min(1).max(4000) });
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'viewer', 'project'); if (gate) return gate; }
  const b = New.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: 'Write a comment first.' }, { status: 400 });
  const { data, error } = await adminClient().from('portal_comments').insert({ project_id: id, ...b.data, author: st.user.id, author_name: nameOf(st.user) }).select(COLS).single();
  if (error) return NextResponse.json({ error: MISSING }, { status: 500 });
  return NextResponse.json({ comment: data });
}

const Change = z.object({ id: z.string().uuid(), resolved: z.boolean().optional(), reply: z.string().trim().min(1).max(4000).optional(), remove: z.boolean().optional() });
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'viewer', 'project'); if (gate) return gate; }
  const b = Change.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  const sb = adminClient();
  const { data: cur } = await sb.from('portal_comments').select(COLS).eq('project_id', id).eq('id', b.data.id).maybeSingle();
  if (!cur) return NextResponse.json({ error: 'That comment has gone.' }, { status: 404 });
  if (b.data.remove) {
    // Only the person who wrote it can delete it
    if (cur.author !== st.user.id) return NextResponse.json({ error: 'Only the person who left a comment can delete it.' }, { status: 403 });
    await sb.from('portal_comments').delete().eq('id', b.data.id);
    return NextResponse.json({ removed: true });
  }
  const patch: Record<string, unknown> = {};
  if (b.data.resolved !== undefined) { patch.resolved_at = b.data.resolved ? new Date().toISOString() : null; patch.resolved_by = b.data.resolved ? nameOf(st.user) : null; }
  if (b.data.reply) patch.replies = [...((cur.replies as unknown[]) || []), { body: b.data.reply, author_name: nameOf(st.user), at: new Date().toISOString() }];
  const { data, error } = await sb.from('portal_comments').update(patch).eq('id', b.data.id).select(COLS).single();
  if (error) return NextResponse.json({ error: MISSING }, { status: 500 });
  return NextResponse.json({ comment: data });
}
