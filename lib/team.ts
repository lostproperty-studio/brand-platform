import { adminClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

export type Member = { user_id: string; email: string | null; role: 'client_admin' | 'client_viewer'; created_at: string; last_sign_in_at?: string | null };

/** People on a project's client team, with when they last signed in. */
export async function listMembers(projectId: string): Promise<Member[]> {
  const sb = adminClient();
  const { data } = await sb.from('project_members').select('user_id, email, role, created_at').eq('project_id', projectId).order('created_at');
  return Promise.all((data || []).map(async (m) => {
    const { data: u } = await sb.auth.admin.getUserById(m.user_id);
    return { ...(m as Member), email: m.email || u.user?.email || null, last_sign_in_at: u.user?.last_sign_in_at ?? null };
  }));
}

/** Invites someone to a project. New people get an invite email; people who already have an account are added straight away. */
export async function inviteMember(projectId: string, slug: string, email: string, role: Member['role'], invitedBy: string) {
  const sb = adminClient();
  const clean = email.trim().toLowerCase();
  let userId: string | null = null;
  let emailed = false;
  const { data: inv, error } = await sb.auth.admin.inviteUserByEmail(clean, { redirectTo: `${env.appUrl()}/auth/confirm?next=${encodeURIComponent('/p/' + slug)}` });
  if (inv?.user) { userId = inv.user.id; emailed = true; }
  else if (error && /already|registered|exists/i.test(error.message)) {
    // Existing account: look it up without sending anything
    const { data: link } = await sb.auth.admin.generateLink({ type: 'magiclink', email: clean });
    userId = link?.user?.id ?? null;
  } else if (error) throw new Error(/rate|limit/i.test(error.message) ? 'Too many invite emails in the last hour. Try again later, or set up custom email sending in Supabase.' : error.message);
  if (!userId) throw new Error('Couldn’t find or create that account.');
  const { error: me } = await sb.from('project_members').upsert({ project_id: projectId, user_id: userId, role, email: clean, invited_by: invitedBy }, { onConflict: 'project_id,user_id' });
  if (me) throw me;
  return { userId, emailed };
}
