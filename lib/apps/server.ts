import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';
import { APPS, portalV2, type AppKey } from '@/lib/portalVersion';

// Portal v2 apps: who can use them, and their files (the app_files table). Only on the staging site for now
// (PORTAL_V2=1); anywhere else the routes answer Not found, so nothing changes for clients.
export const isApp = (a: string): a is AppKey => APPS.some((x) => x.key === a);

export async function appAccess(slug: string, app: string) {
  if (!portalV2() || !isApp(app)) return null;
  const p = await projectBySlug(slug); if (!p) return null;
  const acc = await requireProjectAccess(p.id); if (acc instanceof Response) return null;
  return { p, acc, app };
}

export const db = () => adminClient();

export type AppFileRow = { id: string; title: string; status: 'draft' | 'review' | 'signed'; data: Record<string, unknown>; updated_at: string; created_at: string; created_by: string | null };

/** A project's files for one app, newest first. Empty (with a note) if the table isn't there yet. */
export async function listFiles(projectId: string, app: AppKey, limit = 200) {
  const { data, error } = await db().from('app_files').select('id, title, status, data, updated_at, created_at, created_by').eq('project_id', projectId).eq('app', app).order('updated_at', { ascending: false }).limit(limit);
  return { files: (data || []) as AppFileRow[], error: error ? 'The apps aren’t set up in this database yet.' : null };
}

/** The most recent files across every app, for the home page's Continue creating */
export async function recentFiles(projectId: string, limit = 8) {
  const { data, error } = await db().from('app_files').select('id, app, title, status, data, updated_at').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(limit);
  return error ? [] : (data || []) as (AppFileRow & { app: AppKey })[];
}
