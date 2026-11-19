import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { adminClient } from '@/lib/supabase/server';
import { hashToken } from '@/lib/crypto';
import type { PanelHost } from '@/lib/plugins/catalog';
import { projectStages, canSee } from '@/lib/features';

// The LP panel signs in to the platform the way any app signs in with an account (OAuth 2.0, authorisation code
// with PKCE). Each client's panel, in each app, has its own credentials, tied to that client's project: a panel can
// only ever see the brand it was set up for, and only for people who are still members of that portal.

const CODE_MINUTES = 10, ACCESS_HOURS = 12;
const rand = (prefix: string, n = 24) => prefix + randomBytes(n).toString('base64url');
const db = () => adminClient();

/** Where each app sends people back after they sign in. Anything else is refused. */
export function redirectAllowed(host: PanelHost, uri: string) {
  try {
    const u = new URL(uri);
    if (u.protocol !== 'https:') return false;
    if (host === 'canva') return u.hostname === 'www.canva.com' || u.hostname === 'canva.com' || u.hostname.endsWith('.canva.com');
    const own = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').hostname;
    return u.hostname === own; // Office and Google panels are pages on the platform itself
  } catch { return false; }
}

/** Makes new credentials for one app's panel (replacing any before). The secret is shown once. */
export async function newPanelClient(projectId: string, host: PanelHost, by: string) {
  const sb = db();
  await sb.from('panel_clients').update({ revoked_at: new Date().toISOString() }).eq('project_id', projectId).eq('host', host).is('revoked_at', null);
  const clientId = rand('lpc_', 12), secret = rand('lps_');
  const { error } = await sb.from('panel_clients').insert({ client_id: clientId, project_id: projectId, host, secret_hash: hashToken(secret), created_by: by });
  if (error) throw new Error('Plug-ins aren’t set up in this database yet.');
  return { clientId, secret };
}

export async function panelClients(projectId: string) {
  const { data } = await db().from('panel_clients').select('client_id, host, created_at').eq('project_id', projectId).is('revoked_at', null);
  return (data || []) as { client_id: string; host: PanelHost; created_at: string }[];
}

export async function panelClient(clientId: string) {
  const { data } = await db().from('panel_clients').select('client_id, project_id, host, secret_hash, revoked_at').eq('client_id', clientId).maybeSingle();
  return data && !data.revoked_at ? data as { client_id: string; project_id: string; host: PanelHost; secret_hash: string } : null;
}

export function secretMatches(hash: string, secret: string) {
  const a = Buffer.from(hashToken(secret)), b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Whether someone is still in this portal: the studio, or a member of the project */
export async function stillMember(projectId: string, userId: string) {
  const sb = db();
  const { data: st } = await sb.from('staff').select('user_id').eq('user_id', userId).maybeSingle();
  if (st) return { staff: true };
  const { data: m } = await sb.from('project_members').select('role').eq('project_id', projectId).eq('user_id', userId).maybeSingle();
  return m ? { staff: false } : null;
}

export async function issueCode(c: { client_id: string; project_id: string }, userId: string, redirectUri: string, challenge: string | null) {
  const code = rand('lpa_');
  await db().from('panel_grants').insert({ client_id: c.client_id, project_id: c.project_id, user_id: userId, code_hash: hashToken(code), code_challenge: challenge, redirect_uri: redirectUri, code_expires: new Date(Date.now() + CODE_MINUTES * 60e3).toISOString() });
  return code;
}

const s256 = (v: string) => createHash('sha256').update(v).digest('base64url');
const tokens = () => ({ access: rand('lpt_'), refresh: rand('lpr_') });

/** Swaps a code (or a refresh token) for tokens. Refresh tokens work once: each use gives a new one. */
export async function exchange(c: { client_id: string }, f: { grant_type: string; code?: string; redirect_uri?: string; code_verifier?: string; refresh_token?: string }) {
  const sb = db();
  const col = f.grant_type === 'authorization_code' ? 'code_hash' : f.grant_type === 'refresh_token' ? 'refresh_hash' : null;
  const val = f.grant_type === 'authorization_code' ? f.code : f.refresh_token;
  if (!col || !val) return { error: 'unsupported_grant_type' };
  const { data: g } = await sb.from('panel_grants').select('id, project_id, user_id, client_id, code_challenge, redirect_uri, code_expires, revoked_at').eq(col, hashToken(val)).maybeSingle();
  if (!g || g.revoked_at || g.client_id !== c.client_id) return { error: 'invalid_grant' };
  if (col === 'code_hash') {
    if (!g.code_expires || new Date(g.code_expires).getTime() < Date.now()) return { error: 'invalid_grant' };
    if (g.redirect_uri && f.redirect_uri && g.redirect_uri !== f.redirect_uri) return { error: 'invalid_grant' };
    if (g.code_challenge && (!f.code_verifier || s256(f.code_verifier) !== g.code_challenge)) return { error: 'invalid_grant' };
  }
  if (!(await stillMember(g.project_id, g.user_id))) { await sb.from('panel_grants').update({ revoked_at: new Date().toISOString() }).eq('id', g.id); return { error: 'invalid_grant' }; }
  const t = tokens();
  await sb.from('panel_grants').update({ code_hash: null, code_expires: null, access_hash: hashToken(t.access), refresh_hash: hashToken(t.refresh), access_expires: new Date(Date.now() + ACCESS_HOURS * 3600e3).toISOString(), last_used_at: new Date().toISOString() }).eq('id', g.id);
  return { access_token: t.access, token_type: 'Bearer', expires_in: ACCESS_HOURS * 3600, refresh_token: t.refresh, scope: 'brand' };
}

/** Who a panel request is from: its bearer token, checked against the grant and the person's membership */
export async function panelCaller(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token.startsWith('lpt_')) return null;
  const sb = db();
  const { data: g } = await sb.from('panel_grants').select('id, project_id, user_id, client_id, access_expires, revoked_at').eq('access_hash', hashToken(token)).maybeSingle();
  if (!g || g.revoked_at || !g.access_expires || new Date(g.access_expires).getTime() < Date.now()) return null;
  const c = await panelClient(g.client_id); if (!c) return null;
  const m = await stillMember(g.project_id, g.user_id); if (!m) return null;
  // Turning Plug-ins off for a client (Admin settings → Releases) switches their panels off too
  if (!canSee((await projectStages(g.project_id)).plugins, m.staff)) return null;
  await sb.from('panel_grants').update({ last_used_at: new Date().toISOString() }).eq('id', g.id);
  return { projectId: g.project_id as string, userId: g.user_id as string, host: c.host, staff: m.staff };
}

/** Panels inside Canva run on Canva's own app domain; the Office and Google panels are pages on the platform */
export function panelCors(req: Request) {
  const o = req.headers.get('origin') || '';
  const extra = (process.env.PANEL_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);
  const ok = /^https:\/\/app-[a-z0-9-]+\.canva-apps\.com$/i.test(o) || extra.includes(o);
  return ok ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' } : {} as Record<string, string>;
}
