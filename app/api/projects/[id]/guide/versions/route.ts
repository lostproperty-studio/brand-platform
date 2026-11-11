import { NextResponse } from 'next/server';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { snapshot } from '@/lib/guideVersions';
import type { Guide } from '@/lib/portal/guide';

// Version history of the guidelines: list them, open one, name the current state, or restore an earlier version.
type G = Guide & { _rev?: number };
const MISSING = 'Version history needs a one-off database update (migration 0008_collab.sql).';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'viewer', 'project'); if (gate) return gate; }
  const sb = adminClient();
  const one = new URL(req.url).searchParams.get('v');
  if (one) {
    const { data, error } = await sb.from('guide_versions').select('id, guide, created_at, author_name, label').eq('project_id', id).eq('id', one).maybeSingle();
    if (error || !data) return NextResponse.json({ error: error ? MISSING : 'Not found' }, { status: 404 });
    return NextResponse.json(data);
  }
  const { data, error } = await sb.from('guide_versions').select('id, created_at, author, author_name, label').eq('project_id', id).order('created_at', { ascending: false }).limit(200);
  if (error) return NextResponse.json({ versions: [], error: MISSING });
  return NextResponse.json({ versions: data || [] });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'project'); if (gate) return gate; }
  const b = await req.json().catch(() => ({})) as { label?: string; restore?: string };
  const sb = adminClient();
  const { data: cur } = await sb.from('projects').select('content').eq('id', id).maybeSingle();
  const content = (cur?.content as Record<string, unknown>) || {};
  const guide = content.guide as G | undefined;
  if (!guide) return NextResponse.json({ error: 'No guidelines yet.' }, { status: 409 });

  if (b.label !== undefined) {
    const { error: e } = await sb.from('guide_versions').select('id').limit(1);
    if (e) return NextResponse.json({ error: MISSING }, { status: 501 });
    await snapshot(id, guide, st.user, String(b.label).slice(0, 80) || 'Named version', true);
    return NextResponse.json({ ok: true });
  }
  if (b.restore) {
    const { data: v, error } = await sb.from('guide_versions').select('guide, created_at, author_name').eq('project_id', id).eq('id', b.restore).maybeSingle();
    if (error || !v) return NextResponse.json({ error: error ? MISSING : 'That version isn’t there any more.' }, { status: 404 });
    // Keep what's there now, so the restore can itself be undone
    await snapshot(id, guide, st.user, 'Before restoring', true);
    const next = { ...(v.guide as G), _rev: (guide._rev || 0) + 1 };
    const { error: wErr } = await sb.from('projects').update({ content: { ...content, guide: next } }).eq('id', id);
    if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, guide: next });
  }
  return NextResponse.json({ error: 'Bad request' }, { status: 400 });
}
