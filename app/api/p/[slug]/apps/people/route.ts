import { NextResponse } from 'next/server';
import { appAccess, db } from '@/lib/apps/server';

export const runtime = 'nodejs';

// Portal v2: the people on a project, for owners, reviewers and hand-offs in the apps: the client's team, then the
// Lost Property team. Names and teams only: no email addresses go to the browser.
export type Person = { id: string; name: string; org: string; studio: boolean };
const nice = (email: string | null) => (email || 'Someone').split('@')[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const a = await appAccess(slug, 'writer'); if (!a) return new Response('Not found', { status: 404 });
  const sb = db();
  const [{ data: members }, { data: staff }] = await Promise.all([
    sb.from('project_members').select('user_id, email').eq('project_id', a.p.id),
    sb.from('staff').select('user_id, email, name')
  ]);
  const meta = async (id: string) => { const { data } = await sb.auth.admin.getUserById(id); const m = data.user?.user_metadata as { full_name?: string; name?: string } | undefined; return { name: m?.full_name || m?.name || null, email: data.user?.email || null }; };
  const people: Person[] = [
    ...(await Promise.all((members || []).map(async (m) => { const u = await meta(m.user_id); const email = m.email || u.email; return { id: m.user_id, name: u.name || nice(email), org: a.p.client, studio: false }; }))),
    ...(staff || []).map((s) => ({ id: s.user_id, name: s.name || nice(s.email), org: 'Lost Property', studio: true }))
  ];
  return NextResponse.json({ people, me: a.acc.user.id });
}
