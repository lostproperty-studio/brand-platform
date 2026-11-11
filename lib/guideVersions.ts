import { adminClient, type Staff } from '@/lib/supabase/server';
import type { Guide } from '@/lib/portal/guide';

// Version history: the guidelines are kept as a version every few minutes while someone works on them (and whenever a
// different person picks up), plus named versions saved on purpose and a version before every restore.

export const nameOf = (u: Staff['user']) => {
  const m = (u.user_metadata || {}) as { full_name?: string; name?: string };
  return (m.full_name || m.name || (u.email || 'Someone').split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())).trim();
};

const EVERY = 10 * 60 * 1000, HANDOVER = 2 * 60 * 1000, KEEP = 150;

/** Keeps a version if it's been a while, or someone else made the last one. Fails quietly before the table exists. */
export async function snapshot(projectId: string, guide: Guide, user: Staff['user'], label?: string, force = false) {
  const sb = adminClient();
  if (!force) {
    const { data: last, error } = await sb.from('guide_versions').select('created_at, author').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) return;
    if (last) {
      const age = Date.now() - new Date(last.created_at as string).getTime();
      if (age < (last.author === user.id ? EVERY : HANDOVER)) return;
    }
  }
  const { error } = await sb.from('guide_versions').insert({ project_id: projectId, guide, author: user.id, author_name: nameOf(user), label: label || null });
  if (error) return;
  // Keep the named ones; trim the oldest automatic ones
  const { data: old } = await sb.from('guide_versions').select('id').eq('project_id', projectId).is('label', null).order('created_at', { ascending: false }).range(KEEP, KEEP + 200);
  if (old?.length) await sb.from('guide_versions').delete().in('id', old.map((x) => x.id));
}
