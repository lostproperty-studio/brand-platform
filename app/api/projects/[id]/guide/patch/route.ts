import { NextResponse } from 'next/server';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { apply, isEmpty, type GuidePatch } from '@/lib/guidePatch';
import type { Guide } from '@/lib/portal/guide';
import { snapshot } from '@/lib/guideVersions';

// Saving the guidelines when several people edit at once: each editor sends only what it changed, and it's applied
// to the latest saved guide, so nobody overwrites anybody else. The guide carries a revision number; the write only
// goes through if nobody saved in between, otherwise it re-reads and applies again.

type G = Guide & { _rev?: number };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'viewer', 'project'); if (gate) return gate; }
  const { data } = await adminClient().from('projects').select('content').eq('id', id).maybeSingle();
  const guide = ((data?.content as { guide?: G } | null)?.guide) || null;
  return NextResponse.json({ guide, rev: guide?._rev || 0 });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'project'); if (gate) return gate; }
  const body = await req.json().catch(() => null) as { patch?: GuidePatch } | null;
  const patch = body?.patch;
  if (!patch || typeof patch !== 'object') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const sb = adminClient();
  if (isEmpty(patch)) { const { data } = await sb.from('projects').select('content').eq('id', id).maybeSingle(); return NextResponse.json({ ok: true, rev: (data?.content as { guide?: G })?.guide?._rev || 0 }); }

  for (let tries = 0; tries < 8; tries++) {
    const { data: cur, error: rErr } = await sb.from('projects').select('content').eq('id', id).maybeSingle();
    if (rErr || !cur) return NextResponse.json({ error: rErr?.message || 'Not found' }, { status: rErr ? 500 : 404 });
    const content = (cur.content as Record<string, unknown>) || {};
    const guide = content.guide as G | undefined;
    if (!guide) return NextResponse.json({ error: 'There are no guidelines to save to yet.' }, { status: 409 });
    const rev = guide._rev || 0;
    const next = apply(guide, patch) as G;
    next._rev = rev + 1;
    let q = sb.from('projects').update({ content: { ...content, guide: next }, last_edited_by: st.user.id, last_edited_at: new Date().toISOString() }).eq('id', id);
    q = guide._rev === undefined ? q.is('content->guide->>_rev', null) : q.eq('content->guide->>_rev', String(rev));
    const { data: done, error } = await q.select('id');
    if (error) {
      // An older database without the last-edited columns: save without them
      if (/last_edited/.test(error.message)) {
        let q2 = sb.from('projects').update({ content: { ...content, guide: next } }).eq('id', id);
        q2 = guide._rev === undefined ? q2.is('content->guide->>_rev', null) : q2.eq('content->guide->>_rev', String(rev));
        const r2 = await q2.select('id');
        if (r2.error) return NextResponse.json({ error: r2.error.message }, { status: 500 });
        if (!r2.data?.length) continue;
      } else return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (!done?.length) { await new Promise((r) => setTimeout(r, 40 + Math.random() * 80)); continue; }
    await snapshot(id, next, st.user).catch(() => {});
    return NextResponse.json({ ok: true, rev: next._rev });
  }
  return NextResponse.json({ error: 'Lots of people are saving at once. Trying again…' }, { status: 409 });
}
