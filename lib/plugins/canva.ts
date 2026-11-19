import { createHash, randomBytes } from 'node:crypto';
import { adminClient } from '@/lib/supabase/server';
import { connection, saveConnection, secretOf } from '@/lib/plugins/server';
import { panelBrand } from '@/lib/plugins/panelData';
import { pluginById, settingsOf } from '@/lib/plugins/catalog';

// Sync with Canva (Canva's Connect API). The client's lead connects their Canva account once; the platform then
// keeps a folder in their Canva ("<Client> brand") filled with the logos and approved images, replacing files that
// change and removing ones that are gone.
// The integration it signs in through is either Lost Property's own (CANVA_CLIENT_ID / CANVA_CLIENT_SECRET: it must
// be a public integration, reviewed by Canva, to work for other teams) or one made inside the client's own Canva team
// (a private integration, no review), whose details the studio enters per client. Either way its redirect URL is the
// callback below.

const API = 'https://api.canva.com/rest/v1';
export const CANVA_SCOPES = 'asset:read asset:write folder:read folder:write profile:read';
export const canvaCallback = (origin: string) => `${origin}/api/plugins/canva/callback`;

type Tokens = { access: string; refresh: string; expires: number };
/** What's kept (encrypted) for a client: their own integration's details, if they use one, and the tokens */
type Secret = { app?: { id: string; secret: string }; t?: Tokens };
export type CanvaState = { folder?: string; files?: Record<string, { asset: string; sig: string }>; last?: { at: string; sent: number; removed: number; kept: number; error?: string } };

const envApp = () => (process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET ? { id: process.env.CANVA_CLIENT_ID, secret: process.env.CANVA_CLIENT_SECRET } : null);
/** The integration a client signs in through: their own if they have one, otherwise Lost Property's */
export async function canvaApp(projectId: string) { return (await secretOf<Secret>(projectId, 'canva'))?.app || envApp(); }
const basic = (a: { id: string; secret: string }) => 'Basic ' + Buffer.from(`${a.id}:${a.secret}`).toString('base64');

/** The studio enters a client's own Canva integration (made in their Canva team) */
export async function setCanvaApp(projectId: string, app: { id: string; secret: string } | null, by: string) {
  const cur = (await secretOf<Secret>(projectId, 'canva')) || {};
  await saveConnection(projectId, 'canva', { secret: { ...cur, app: app || undefined, t: undefined }, account: null, by });
}

/** The link that sends the lead to Canva to allow access. The verifier is kept (signed) in a cookie until they're back. */
export function authoriseUrl(origin: string, state: string, clientId: string) {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ code_challenge: challenge, code_challenge_method: 's256', scope: CANVA_SCOPES, response_type: 'code', client_id: clientId, state, redirect_uri: canvaCallback(origin) });
  return { url: `https://www.canva.com/api/oauth/authorize?${q}`, verifier };
}

async function tokenRequest(app: { id: string; secret: string }, body: Record<string, string>): Promise<Tokens> {
  const r = await fetch(`${API}/oauth/token`, { method: 'POST', headers: { Authorization: basic(app), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.message || 'Canva didn’t accept the sign-in.');
  return { access: j.access_token, refresh: j.refresh_token, expires: Date.now() + (Number(j.expires_in) || 14400) * 1000 - 60_000 };
}

export async function finishConnect(projectId: string, userId: string, code: string, verifier: string, origin: string) {
  const app = await canvaApp(projectId);
  if (!app) throw new Error('Canva isn’t set up on the platform yet.');
  const t = await tokenRequest(app, { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: canvaCallback(origin) });
  const me = await fetch(`${API}/users/me/profile`, { headers: { Authorization: `Bearer ${t.access}` } }).then((r) => r.json()).catch(() => ({}));
  const def = pluginById('canva')!;
  const cur = await connection(projectId, 'canva');
  const sec = (await secretOf<Secret>(projectId, 'canva')) || {};
  await saveConnection(projectId, 'canva', { account: me?.profile?.display_name || 'Canva account', secret: { ...sec, t }, settings: cur?.account ? undefined : settingsOf(def, cur?.settings || {}), by: userId });
}

/** A working access token: refreshed when it's run out (Canva's refresh tokens work once, so the new one is kept) */
async function access(projectId: string) {
  const sec = await secretOf<Secret>(projectId, 'canva');
  const t = sec?.t, app = sec?.app || envApp();
  if (!t || !app) throw new Error('Canva isn’t connected.');
  if (t.expires > Date.now()) return t.access;
  const n = await tokenRequest(app, { grant_type: 'refresh_token', refresh_token: t.refresh });
  await saveConnection(projectId, 'canva', { secret: { ...sec, t: n } });
  return n.access;
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) } });
    if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 2000 * (i + 1))); continue; }
    if (r.status === 204) return {} as T;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.message || `Canva answered ${r.status}`) as Error & { status: number }; e.status = r.status; throw e; }
    return j as T;
  }
  throw new Error('Canva is busy. Try again in a minute.');
}

async function ensureFolder(token: string, state: CanvaState, name: string) {
  if (state.folder) { try { await call(token, `/folders/${state.folder}`); return state.folder; } catch (e) { if ((e as { status?: number }).status !== 404) throw e; } }
  const r = await call<{ folder: { id: string } }>(token, '/folders', { method: 'POST', body: JSON.stringify({ name, parent_folder_id: 'root' }) });
  return r.folder.id;
}

async function uploadFromUrl(token: string, name: string, url: string) {
  const { job } = await call<{ job: { id: string; status: string; asset?: { id: string }; error?: { message?: string } } }>(token, '/url-asset-uploads', { method: 'POST', body: JSON.stringify({ name: name.slice(0, 50), url }) });
  let j = job;
  for (let i = 0; i < 30 && j.status === 'in_progress'; i++) { await new Promise((ok) => setTimeout(ok, 1000 + i * 250)); j = (await call<{ job: typeof job }>(token, `/url-asset-uploads/${job.id}`)).job; }
  if (j.status !== 'success' || !j.asset) throw new Error(j.error?.message || `Canva couldn’t take ${name}.`);
  return j.asset.id;
}

/** Brings the client's Canva folder up to date with the brand as it is now */
export async function syncCanva(projectId: string, slug: string, origin: string) {
  const c = await connection(projectId, 'canva');
  if (!c?.account) throw new Error('Canva isn’t connected.');
  const set = settingsOf(pluginById('canva')!, c.settings);
  const state = (c.state || {}) as CanvaState;
  const token = await access(projectId);
  const brand = await panelBrand(projectId, slug, false, origin);
  if (!brand) throw new Error('Publish the guidelines first: Canva gets what’s published.');
  const { data: sigs } = await adminClient().from('deliverable_files').select('path, bytes, deliverable_parts!inner(project_id)').eq('deliverable_parts.project_id', projectId).like('path', 'assets/logo%');
  const size = new Map(((sigs || []) as { path: string; bytes: number | null }[]).map((r) => [r.path.replace(/\.(png|svg)$/i, ''), String(r.bytes ?? '')]));

  // What should be there: key → name, url, and a signature that changes when the file does
  const want = new Map<string, { name: string; url: string; sig: string }>();
  if (set.logos) for (const l of brand.logos) want.set(`logo:${l.id}`, { name: `${brand.client} ${l.name}`, url: l.url, sig: `${l.format}:${size.get(l.id) || ''}` });
  if (set.images) for (const im of brand.images) want.set(`image:${im.id}`, { name: im.name, url: im.url, sig: `${im.w}x${im.h}` });

  const folder = await ensureFolder(token, state, `${brand.client} brand`);
  const files = { ...(state.files || {}) };
  let sent = 0, removed = 0, kept = 0; const errors: string[] = [];
  for (const [key, f] of want) {
    const had = files[key];
    if (had && had.sig === f.sig) { kept++; continue; }
    try {
      const asset = await uploadFromUrl(token, f.name, f.url);
      await call(token, '/folders/move', { method: 'POST', body: JSON.stringify({ to_folder_id: folder, item_id: asset }) }).catch(() => {});
      if (had) await call(token, `/assets/${had.asset}`, { method: 'DELETE' }).catch(() => {});
      files[key] = { asset, sig: f.sig }; sent++;
    } catch (e) { errors.push((e as Error).message); }
  }
  for (const key of Object.keys(files)) if (!want.has(key)) { await call(token, `/assets/${files[key].asset}`, { method: 'DELETE' }).catch(() => {}); delete files[key]; removed++; }
  const last = { at: new Date().toISOString(), sent, removed, kept, ...(errors.length ? { error: `${errors.length} file${errors.length > 1 ? 's' : ''} didn’t go: ${errors[0]}` } : {}) };
  await saveConnection(projectId, 'canva', { state: { folder, files, last } });
  return last;
}

/** After a publish: sync Canva if it's connected and set to update itself. Never stops the publish. */
export async function afterPublish(projectId: string, slug: string, origin: string) {
  try {
    const c = await connection(projectId, 'canva');
    if (!c?.account || !settingsOf(pluginById('canva')!, c.settings).auto) return;
    await syncCanva(projectId, slug, origin);
  } catch (e) {
    await saveConnection(projectId, 'canva', { state: { last: { at: new Date().toISOString(), sent: 0, removed: 0, kept: 0, error: (e as Error).message } } }).catch(() => {});
  }
}
