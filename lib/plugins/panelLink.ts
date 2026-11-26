import { randomBytes, randomInt } from 'node:crypto';
import { activeStaff, adminClient } from '@/lib/supabase/server';
import { hashToken } from '@/lib/crypto';
import { projectStages, canSee } from '@/lib/features';
import { internalClient, mintGrant, secretMatches, stillMember } from '@/lib/plugins/panelAuth';
import type { PanelHost } from '@/lib/plugins/catalog';

// Signing in to the panel by link (Office, Google Workspace, Figma): those apps run the panel where a normal sign-in
// can't happen, so the panel shows a short code and opens a page on the platform. The person signs in there, checks
// the code matches what their panel shows, and chooses the brand. The panel, waiting, then picks up its tokens.

const MINUTES = 10;
const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';
const db = () => adminClient();
export const LINK_HOSTS: PanelHost[] = ['office', 'google', 'figma'];

export async function createLink(host: PanelHost, hint?: string) {
  const id = randomBytes(12).toString('base64url'), poll = 'lpl_' + randomBytes(24).toString('base64url');
  const words = Array.from({ length: 4 }, () => LETTERS[randomInt(LETTERS.length)]).join('') + '-' + String(randomInt(100, 1000));
  const { error } = await db().from('panel_links').insert({ id, poll_hash: hashToken(poll), host, words, hint: hint?.slice(0, 60) || null, expires_at: new Date(Date.now() + MINUTES * 60e3).toISOString() });
  if (error) throw new Error('The panel isn’t set up in this database yet.');
  return { id, poll, words };
}

export async function readLink(id: string) {
  const { data } = await db().from('panel_links').select('id, host, words, hint, project_id, approved_at, used_at, expires_at').eq('id', id).maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at).getTime() < Date.now()) return null;
  return data as { id: string; host: PanelHost; words: string; hint: string | null; project_id: string | null; approved_at: string | null };
}

/** The brands someone can sign a panel in to: projects they're in where Plug-ins is turned on for them */
export async function brandsFor(userId: string) {
  const sb = db();
  const staff = !!(await activeStaff(userId));
  const rows = staff
    ? (await sb.from('projects').select('id, client, slug').order('client')).data || []
    : ((await sb.from('project_members').select('projects!inner(id, client, slug)').eq('user_id', userId)).data || []).map((r) => (Array.isArray(r.projects) ? r.projects[0] : r.projects) as { id: string; client: string; slug: string });
  const out: { id: string; client: string; slug: string }[] = [];
  for (const p of rows) if (canSee((await projectStages(p.id)).plugins, staff)) out.push(p);
  return out;
}

export async function approveLink(id: string, userId: string, projectId: string) {
  const l = await readLink(id); if (!l || l.approved_at) return false;
  if (!(await stillMember(projectId, userId))) return false;
  if (!(await brandsFor(userId)).some((b) => b.id === projectId)) return false;
  await db().from('panel_links').update({ project_id: projectId, user_id: userId, approved_at: new Date().toISOString() }).eq('id', id);
  return true;
}

/** The panel asks whether it's been approved yet. Once it has, the link gives out tokens once and is spent. */
export async function pollLink(id: string, poll: string) {
  const sb = db();
  const { data: l } = await sb.from('panel_links').select('id, poll_hash, host, project_id, user_id, approved_at, used_at, expires_at').eq('id', id).maybeSingle();
  if (!l || !secretMatches(l.poll_hash, poll)) return { status: 'invalid' as const };
  if (l.used_at) return { status: 'invalid' as const };
  if (new Date(l.expires_at).getTime() < Date.now()) return { status: 'expired' as const };
  if (!l.approved_at || !l.project_id || !l.user_id) return { status: 'waiting' as const };
  await sb.from('panel_links').update({ used_at: new Date().toISOString() }).eq('id', id);
  const client = await internalClient(l.project_id, l.host as PanelHost);
  return { status: 'ready' as const, ...(await mintGrant(client, l.project_id, l.user_id)) };
}
