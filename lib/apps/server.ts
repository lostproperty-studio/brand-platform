import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';
import { APPS, type AppKey } from '@/lib/portalVersion';
import { portalV2Studio } from '@/lib/portalVersionServer';

// Portal v2 apps: who can use them, and their files (the app_files table). Open on the staging site, and on any
// project whose 'portal' release stage isn't Off; anywhere else the routes answer Not found.
export const isApp = (a: string): a is AppKey => APPS.some((x) => x.key === a);

export async function appAccess(slug: string, app: string) {
  if (!isApp(app)) return null;
  const p = await projectBySlug(slug); if (!p || !(await portalV2Studio(p.id))) return null;
  const acc = await requireProjectAccess(p.id); if (acc instanceof Response) return null;
  return { p, acc, app };
}

export const db = () => adminClient();

export type Visibility = 'private' | 'team';
export type AppFileRow = { id: string; title: string; status: 'draft' | 'review' | 'signed'; data: Record<string, unknown>; updated_at: string; created_at: string; created_by: string | null;
  /** Made by Lost Property in the studio preview: clients never see it */ studio?: boolean;
  visibility?: Visibility; members?: string[] };
export type Viewer = { id: string; staff: boolean };
export const viewerOf = (acc: { user: { id: string }; staff: boolean }): Viewer => ({ id: acc.user.id, staff: acc.staff });

const BASE = 'id, title, status, data, updated_at, created_at, created_by';
const SHARE = ', studio, visibility, members';

/** Whether app_files has the sharing columns yet (migration 0017). Checked once per server. */
let sharing: boolean | null = null;
export async function hasSharing() {
  if (sharing === null) { const { error } = await db().from('app_files').select('visibility').limit(1); sharing = !error; }
  return sharing;
}

/** Until migration 0017 runs, a file counts as the studio's when a member of staff made it */
let staffIds: { at: number; ids: Set<string> } | null = null;
async function studioMakers() {
  if (!staffIds || Date.now() - staffIds.at > 60_000) { const { data } = await db().from('staff').select('user_id'); staffIds = { at: Date.now(), ids: new Set((data || []).map((r) => r.user_id as string)) }; }
  return staffIds.ids;
}
async function fill<T extends AppFileRow>(rows: T[]): Promise<T[]> {
  if (await hasSharing()) return rows;
  const st = await studioMakers();
  return rows.map((r) => { const studio = !!r.created_by && st.has(r.created_by); return { ...r, studio, visibility: studio ? 'private' : 'team', members: [] }; });
}

/** Who can open a file: whoever made it, anyone added to it, and, when it's shared with the team, everyone on that
 *  side (the studio sees the client's team files too; clients never see the studio's). */
export function canOpen(f: AppFileRow, v: Viewer) {
  if (f.created_by === v.id || (f.members || []).includes(v.id)) return true;
  if (f.visibility !== 'team') return false;
  return v.staff || !f.studio;
}
export const isOwner = (f: AppFileRow, v: Viewer) => f.created_by === v.id;

async function select(q: (cols: string) => PromiseLike<{ data: unknown; error: unknown }>) {
  const r = await q(BASE + ((await hasSharing()) ? SHARE : ''));
  return { rows: await fill((r.data || []) as AppFileRow[]), error: r.error };
}

/** A project's files for one app that this person can open, newest first. Empty (with a note) if the table isn't there yet. */
export async function listFiles(projectId: string, app: AppKey, viewer: Viewer, limit = 200) {
  const { rows, error } = await select((cols) => db().from('app_files').select(cols).eq('project_id', projectId).eq('app', app).order('updated_at', { ascending: false }).limit(Math.max(limit, 300)));
  return { files: rows.filter((f) => canOpen(f, viewer)).slice(0, limit), error: error ? 'The apps aren’t set up in this database yet.' : null };
}

/** One file, if this person can open it */
export async function openFile(projectId: string, app: AppKey, id: string, viewer: Viewer) {
  const { rows } = await select((cols) => db().from('app_files').select(cols).eq('id', id).eq('project_id', projectId).eq('app', app).limit(1));
  const f = rows[0];
  return f && canOpen(f, viewer) ? f : null;
}

/** The most recent files across every app that this person can open, for the home page's Continue creating */
export async function recentFiles(projectId: string, viewer: Viewer, limit = 8) {
  const { rows, error } = await select((cols) => db().from('app_files').select(cols + ', app').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(200));
  return error ? [] : (rows as (AppFileRow & { app: AppKey })[]).filter((f) => canOpen(f, viewer)).slice(0, limit);
}

/** For places that show a client's files to the client outside the apps (the design-tool panels): drop the studio's */
export async function clientFiles<T extends { created_by?: string | null; studio?: boolean }>(rows: T[]) {
  if (await hasSharing()) return rows.filter((r) => !r.studio);
  const st = await studioMakers();
  return rows.filter((r) => !r.created_by || !st.has(r.created_by));
}
