import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appAccess, db, hasSharing, isOwner, openFile, viewerOf } from '@/lib/apps/server';

export const runtime = 'nodejs';
type P = { params: Promise<{ slug: string; app: string; id: string }> };

// Portal v2: one file in an app. Open it, save it (title, status, contents, who it's shared with), or delete it.
// Only people who can open a file can do any of these; only the person who made it can change who it's shared with or delete it.
export async function GET(_: Request, ctx: P) {
  const { slug, app, id } = await ctx.params;
  const a = await appAccess(slug, app); if (!a) return new Response('Not found', { status: 404 });
  const file = await openFile(a.p.id, a.app, id, viewerOf(a.acc));
  if (!file) return NextResponse.json({ error: 'This file isn’t shared with you.' }, { status: 404 });
  return NextResponse.json({ file, me: a.acc.user.id });
}

const Save = z.object({ title: z.string().trim().min(1).max(160).optional(), status: z.enum(['draft', 'review', 'signed']).optional(), data: z.record(z.unknown()).optional(),
  visibility: z.enum(['private', 'team']).optional(), members: z.array(z.string().uuid()).max(100).optional() });
export async function PATCH(req: Request, ctx: P) {
  const { slug, app, id } = await ctx.params;
  const a = await appAccess(slug, app); if (!a) return new Response('Not found', { status: 404 });
  const v = viewerOf(a.acc);
  const b = Save.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const f = await openFile(a.p.id, a.app, id, v);
  if (!f) return NextResponse.json({ error: 'This file isn’t shared with you.' }, { status: 404 });
  if (JSON.stringify(b.data.data || {}).length > 2_000_000) return NextResponse.json({ error: 'This file is too big to save.' }, { status: 413 });
  const { visibility, members, ...rest } = b.data;
  const update: Record<string, unknown> = { ...rest };
  if (visibility !== undefined || members !== undefined) {
    if (!isOwner(f, v)) return NextResponse.json({ error: 'Only the person who made this file can change who it’s shared with.' }, { status: 403 });
    if (!(await hasSharing())) return NextResponse.json({ error: 'Sharing isn’t set up in this database yet (migration 0017).' }, { status: 409 });
    if (visibility) update.visibility = visibility;
    if (members) {
      // Studio files can only be shared within Lost Property; a client's files with their team and Lost Property
      const [{ data: staff }, { data: team }] = await Promise.all([db().from('staff').select('user_id'), f.studio ? Promise.resolve({ data: [] as { user_id: string }[] }) : db().from('project_members').select('user_id').eq('project_id', a.p.id)]);
      const allowed = new Set([...(staff || []), ...(team || [])].map((r) => r.user_id as string));
      update.members = [...new Set(members)].filter((m) => allowed.has(m) && m !== f.created_by);
    }
  }
  const { data, error } = await db().from('app_files').update({ ...update, updated_by: v.id, updated_at: new Date().toISOString() }).eq('id', id).eq('project_id', a.p.id).eq('app', a.app).select('updated_at').maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Couldn’t save: ' + (error?.message || 'not found') }, { status: 500 });
  return NextResponse.json({ ok: true, updated_at: data.updated_at, members: update.members });
}

export async function DELETE(_: Request, ctx: P) {
  const { slug, app, id } = await ctx.params;
  const a = await appAccess(slug, app); if (!a) return new Response('Not found', { status: 404 });
  const v = viewerOf(a.acc);
  const f = await openFile(a.p.id, a.app, id, v);
  if (!f) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isOwner(f, v) && f.created_by) return NextResponse.json({ error: 'Only the person who made this file can delete it.' }, { status: 403 });
  await db().from('app_files').delete().eq('id', id).eq('project_id', a.p.id).eq('app', a.app);
  return NextResponse.json({ ok: true });
}
