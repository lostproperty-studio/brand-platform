import { adminClient } from '@/lib/supabase/server';

export type ActivityKind = 'visit' | 'download' | 'tool' | 'skill' | 'ask' | 'join' | 'upload';

/** Records what someone did in a portal, for the studio's view of the client. Never blocks or fails the request. */
export async function logActivity(projectId: string, userId: string | null, kind: ActivityKind, detail?: string) {
  try { await adminClient().from('activity').insert({ project_id: projectId, user_id: userId, kind, detail: detail?.slice(0, 300) ?? null }); } catch { /* best effort */ }
}

/** A visit counts once per person per 30 minutes. */
export async function logVisit(projectId: string, userId: string) {
  try {
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { count } = await adminClient().from('activity').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('user_id', userId).eq('kind', 'visit').gte('created_at', since);
    if (!count) await logActivity(projectId, userId, 'visit');
  } catch { /* best effort */ }
}
