import { adminClient, type Staff } from '@/lib/supabase/server';

// The studio team on a project. Leads manage the team and can delete the project; editors change and publish it;
// viewers can look but not change anything. Studio admins are leads everywhere. A project with nobody listed is
// open to the whole studio as editors, so nothing changes until someone sets up its team.
export type TeamRole = 'lead' | 'editor' | 'viewer';
export const TEAM_ROLES: { id: TeamRole; label: string; help: string }[] = [
  { id: 'lead', label: 'Lead', help: 'Edits and publishes, manages the team, can delete the project.' },
  { id: 'editor', label: 'Editor', help: 'Edits and publishes.' },
  { id: 'viewer', label: 'Viewer', help: 'Can look, but not change anything.' }
];
const RANK: Record<TeamRole, number> = { viewer: 0, editor: 1, lead: 2 };
export type TeamRow = { email: string; user_id: string | null; role: TeamRole; created_at: string };

export async function teamRows(projectId: string): Promise<TeamRow[]> {
  const { data, error } = await adminClient().from('project_team').select('email, user_id, role, created_at').eq('project_id', projectId).order('created_at');
  return error ? [] : ((data || []) as TeamRow[]);
}

export async function teamRole(projectId: string, st: Staff, rows?: TeamRow[]): Promise<TeamRole | null> {
  if (st.role === 'admin') return 'lead';
  const list = rows || (await teamRows(projectId));
  if (!list.length) return 'editor';
  const email = (st.user.email || '').toLowerCase();
  return list.find((r) => r.user_id === st.user.id || r.email.toLowerCase() === email)?.role ?? null;
}

/** Checks the studio member may do this on the project; for changes, records them as the last editor.
 *  Returns a Response to send back when they may not, or null when they may. */
export async function teamGate(projectId: string, st: Staff, need: TeamRole, area?: string): Promise<Response | null> {
  const role = await teamRole(projectId, st);
  if (!role) return new Response('You’re not on this project’s team. Ask its lead to add you.', { status: 403 });
  if (RANK[role] < RANK[need]) return new Response(need === 'lead' ? 'Only the project’s leads can do this.' : 'You can view this project but not change it.', { status: 403 });
  if (need !== 'viewer') await touch(projectId, st.user.id, area);
  return null;
}

/** Last edit: who and when, plus an entry in the project's activity at most every ten minutes per person and area */
async function touch(projectId: string, userId: string, area?: string) {
  try {
    const sb = adminClient();
    await sb.from('projects').update({ last_edited_by: userId, last_edited_at: new Date().toISOString() }).eq('id', projectId);
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await sb.from('activity').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('user_id', userId).eq('kind', 'edit').eq('detail', area || 'project').gte('created_at', since);
    if (!count) await sb.from('activity').insert({ project_id: projectId, user_id: userId, kind: 'edit', detail: area || 'project' });
  } catch { /* best effort; never blocks the change */ }
}
