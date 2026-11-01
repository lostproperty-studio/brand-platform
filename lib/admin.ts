import { adminClient, requireStaff, type Staff } from '@/lib/supabase/server';

/** Studio admins only. If the studio has no admin yet, the first member to open Admin settings becomes one. */
export async function requireAdmin(): Promise<Staff | Response> {
  const st = await requireStaff(); if (st instanceof Response) return st;
  if (st.role === 'admin') return st;
  const sb = adminClient();
  const { data: admins } = await sb.from('staff').select('*').eq('role', 'admin');
  if (!(admins || []).some((a) => (a as { active?: boolean }).active !== false)) {
    await sb.from('staff').update({ role: 'admin' }).eq('user_id', st.user.id);
    return { ...st, role: 'admin' };
  }
  return new Response('Only studio admins can open Admin settings.', { status: 403 });
}

export type StudioMember = { user_id: string; email: string; name: string | null; role: 'admin' | 'editor'; active: boolean; created_at: string; last_sign_in_at: string | null; projects: number };

export async function listStaff(): Promise<StudioMember[]> {
  const sb = adminClient();
  const [{ data }, { data: teams }] = await Promise.all([sb.from('staff').select('*').order('created_at'), sb.from('project_team').select('email')]);
  return Promise.all(((data || []) as { user_id: string; email: string; name: string | null; role: 'admin' | 'editor'; active?: boolean; created_at: string }[]).map(async (s) => {
    const { data: u } = await sb.auth.admin.getUserById(s.user_id);
    return { ...s, active: s.active !== false, last_sign_in_at: u.user?.last_sign_in_at ?? null, projects: (teams || []).filter((t) => String(t.email).toLowerCase() === s.email.toLowerCase()).length };
  }));
}
