import { adminClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { findInvite } from '@/lib/team';

/** Finds an existing account by email, without creating one */
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

// Who may be sent a sign-in link: studio emails, studio members, clients on a project, and people joining through a
// valid invite link. Anyone else is shown the same "check your email" message, but no email goes and no account is made.
export async function mayGetLink(email: string, back: string): Promise<boolean> {
  const clean = email.trim().toLowerCase();
  if (!clean.includes('@')) return false;
  if (env.studioDomains().includes(clean.split('@')[1])) return true;
  const sb = adminClient();
  // Joining through an invite link
  const token = back.match(/^\/join\/([^/?#]+)/)?.[1];
  if (token) { const inv = await findInvite(token).catch(() => null); if (inv && 'link' in inv && inv.link) return true; }
  // Studio members (freelancers added in Admin settings) and studio team invitations
  const { data: staff } = await sb.from('staff').select('*').ilike('email', clean).maybeSingle();
  if (staff && (staff as { active?: boolean }).active !== false) return true;
  // Clients on a project, by the email they were added with or their account
  const { count } = await sb.from('project_members').select('user_id', { count: 'exact', head: true }).ilike('email', clean);
  if (count) return true;
  const u = await findUser(clean);
  if (!u) return false;
  const [{ count: m }, { data: st2 }] = await Promise.all([
    sb.from('project_members').select('user_id', { count: 'exact', head: true }).eq('user_id', u.id),
    sb.from('staff').select('*').eq('user_id', u.id).maybeSingle()
  ]);
  return !!m || (!!st2 && (st2 as { active?: boolean }).active !== false);
}
