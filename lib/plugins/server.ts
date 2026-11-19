import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';
import { projectStages, canSee } from '@/lib/features';
import { portalV2 } from '@/lib/portalVersion';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { PLUGINS, pluginById, settingsOf, type PluginId } from '@/lib/plugins/catalog';

// Plug-ins, server side: who can see and change them, and each client's connected accounts (plugin_connections).
// Everyone in the portal sees the section once its stage allows; only the client's lead (or the studio) connects.

export async function pluginsAccess(slug: string) {
  if (!portalV2()) return null;
  const p = await projectBySlug(slug); if (!p) return null;
  const acc = await requireProjectAccess(p.id); if (acc instanceof Response) return null;
  const stage = (await projectStages(p.id)).plugins;
  if (!canSee(stage, acc.staff)) return null;
  return { p, acc, stage, lead: acc.clientAdmin };
}

/** Which plug-ins the platform has been set up for (the developer apps registered with each maker) */
export const googleAddonUrl = () => process.env.GOOGLE_ADDON_URL || null;

export function configured(id: PluginId) {
  const e = process.env;
  switch (id) {
    case 'canva': return { panel: true, account: !!(e.CANVA_CLIENT_ID && e.CANVA_CLIENT_SECRET) };
    case 'office': return { panel: true, account: false };
    // The Google add-on's Marketplace listing, once Lost Property has published it (see plugins/google/README.md)
    case 'google': return { panel: !!e.GOOGLE_ADDON_URL, account: false };
    default: return { panel: false, account: false };
  }
}

export type Connection = { id: string; plugin: PluginId; account: string | null; settings: Record<string, unknown>; state: Record<string, unknown>; connected_by: string | null; updated_at: string };

/** A project's connections, by plug-in. `ready` is false when the table isn't there yet (before the migration). */
export async function connections(projectId: string) {
  const { data, error } = await adminClient().from('plugin_connections').select('id, plugin, account, settings, state, connected_by, updated_at').eq('project_id', projectId);
  const rows = Object.fromEntries(((data || []) as Connection[]).map((r) => [r.plugin, r])) as Partial<Record<PluginId, Connection>>;
  return { rows, ready: !error };
}

export async function connection(projectId: string, plugin: PluginId) {
  const { data } = await adminClient().from('plugin_connections').select('id, plugin, account, settings, state, connected_by, updated_at, secret').eq('project_id', projectId).eq('plugin', plugin).maybeSingle();
  return data as (Connection & { secret: string | null }) | null;
}

export async function secretOf<T>(projectId: string, plugin: PluginId): Promise<T | null> {
  const c = await connection(projectId, plugin);
  if (!c?.secret) return null;
  try { return JSON.parse(decryptSecret(c.secret)) as T; } catch { return null; }
}

export async function saveConnection(projectId: string, plugin: PluginId, v: { account?: string | null; secret?: unknown; settings?: Record<string, unknown>; state?: Record<string, unknown>; by?: string | null }) {
  const cur = await connection(projectId, plugin);
  const row: Record<string, unknown> = { project_id: projectId, plugin, updated_at: new Date().toISOString() };
  if (v.account !== undefined) row.account = v.account;
  if (v.secret !== undefined) row.secret = v.secret === null ? null : encryptSecret(JSON.stringify(v.secret));
  if (v.settings) row.settings = { ...(cur?.settings || {}), ...v.settings };
  if (v.state) row.state = { ...(cur?.state || {}), ...v.state };
  if (v.by !== undefined && !cur) row.connected_by = v.by;
  const { error } = await adminClient().from('plugin_connections').upsert(row, { onConflict: 'project_id,plugin' });
  if (error) throw new Error('Plug-ins aren’t set up in this database yet.');
}

export async function removeConnection(projectId: string, plugin: PluginId) {
  await adminClient().from('plugin_connections').delete().eq('project_id', projectId).eq('plugin', plugin);
}

/** Only one storage account holds the originals: turning it on for one turns it off for the others */
export async function setHome(projectId: string, plugin: PluginId) {
  const storage = PLUGINS.filter((p) => p.group === 'storage' && p.id !== plugin).map((p) => p.id);
  const { rows } = await connections(projectId);
  for (const id of storage) if (rows[id] && rows[id]!.settings?.home) await saveConnection(projectId, id, { settings: { home: false } });
}

/** A plug-in's settings as the client sees them: studio-only ones are left out unless it's the studio */
export function visibleSettings(id: PluginId, saved: Record<string, unknown> | undefined, staff: boolean) {
  const def = pluginById(id)!;
  const all = settingsOf(def, saved);
  return Object.fromEntries(Object.entries(all).filter(([k]) => staff || !def.settings.find((s) => s.id === k)?.studioOnly));
}
