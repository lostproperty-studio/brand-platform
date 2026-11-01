import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { requireAdmin, listStaff } from '@/lib/admin';
import { env } from '@/lib/env';
import { emailProvider, sendEmail } from '@/lib/email/send';
import { studioBrand } from '@/lib/email/brand';
import { studioInviteEmail } from '@/lib/email/templates';
import { ensureUser, signInUrl } from '@/lib/auth/links';

// Studio members: everyone at Lost Property who can use the platform. Members create projects, edit content and
// manage client access; admins also manage the team and the domain.
export async function GET() {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  return NextResponse.json({ staff: await listStaff(), me: st.user.id });
}

async function findUser(email: string) {
  const sb = adminClient();
  for (let page = 1; page < 20; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    const u = data?.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u;
    if (!data || data.users.length < 200) return null;
  }
  return null;
}

// Add someone: they get an email invite and can sign in straight away
export async function POST(req: Request) {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  const b = z.object({ email: z.string().email().max(200), name: z.string().max(120).optional(), role: z.enum(['admin', 'editor']).default('editor') }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Add a valid email address.' }, { status: 400 });
  const email = b.data.email.trim().toLowerCase();
  const sb = adminClient();
  let user = await findUser(email);
  let invited = false;
  if (emailProvider()) {
    // The platform's own welcome email, with a link that signs them straight in
    user = user || (await ensureUser(email));
    try { const { url } = await signInUrl(email, '/studio'); const { data: me } = await sb.from('staff').select('name, email').eq('user_id', st.user.id).maybeSingle(); await sendEmail({ to: email, ...studioInviteEmail(studioBrand(), url, (me?.name as string) || (me?.email as string) || null) }); invited = true; } catch (e) { console.error('[studio invite]', e); }
  } else if (!user) {
    const { data, error } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: `${env.appUrl()}/auth/callback?next=/studio` });
    if (error || !data.user) {
      // Email may not be set up for invites: create the account; they sign in with their email at the usual page
      const { data: c, error: ce } = await sb.auth.admin.createUser({ email, email_confirm: true });
      if (ce || !c.user) return NextResponse.json({ error: ce?.message || error?.message || 'Couldn’t create the account.' }, { status: 500 });
      user = c.user;
    } else { user = data.user; invited = true; }
  }
  const { error } = await sb.from('staff').upsert({ user_id: user.id, email, name: b.data.name?.trim() || null, role: b.data.role, active: true }, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await sb.from('project_team').update({ user_id: user.id }).eq('email', email);
  return NextResponse.json({ staff: await listStaff(), invited });
}

// Change someone's role or name, or remove them (they keep their record but lose access)
export async function PATCH(req: Request) {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  const b = z.object({ user_id: z.string().uuid(), role: z.enum(['admin', 'editor']).optional(), name: z.string().max(120).optional(), active: z.boolean().optional() }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { user_id, ...patch } = b.data;
  const sb = adminClient();
  if (user_id === st.user.id && (patch.role === 'editor' || patch.active === false)) {
    const others = (await listStaff()).filter((s) => s.role === 'admin' && s.active && s.user_id !== st.user.id);
    if (!others.length) return NextResponse.json({ error: 'You’re the only admin. Make someone else an admin first.' }, { status: 400 });
  }
  const { error } = await sb.from('staff').update(patch).eq('user_id', user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (patch.active === false) {
    const { data: s } = await sb.from('staff').select('email').eq('user_id', user_id).maybeSingle();
    if (s?.email) await sb.from('project_team').delete().eq('email', String(s.email).toLowerCase());
  }
  return NextResponse.json({ staff: await listStaff() });
}
