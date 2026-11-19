import { NextResponse } from 'next/server';
import { portalV2 } from '@/lib/portalVersion';
import { exchange, panelClient, panelCors, secretMatches } from '@/lib/plugins/panelAuth';

// Swaps the one-time code (or a refresh token) for the panel's tokens. Called by the app's own server (Canva's), with
// the panel's credentials, as a standard OAuth 2.0 token request.
export async function POST(req: Request) {
  if (!portalV2()) return new Response('Not found', { status: 404 });
  const cors = panelCors(req);
  const ct = req.headers.get('content-type') || '';
  const f = ct.includes('application/json') ? await req.json().catch(() => ({})) : Object.fromEntries((await req.formData().catch(() => new FormData())).entries());
  let id = String(f.client_id || ''), secret = String(f.client_secret || '');
  const basic = (req.headers.get('authorization') || '').match(/^Basic\s+(.+)$/i);
  if (basic) { const [a, b] = Buffer.from(basic[1], 'base64').toString('utf8').split(':'); id = decodeURIComponent(a || ''); secret = decodeURIComponent(b || ''); }
  const c = await panelClient(id);
  if (!c || !secret || !secretMatches(c.secret_hash, secret)) return NextResponse.json({ error: 'invalid_client' }, { status: 401, headers: cors });
  const out = await exchange(c, { grant_type: String(f.grant_type || ''), code: f.code ? String(f.code) : undefined, redirect_uri: f.redirect_uri ? String(f.redirect_uri) : undefined, code_verifier: f.code_verifier ? String(f.code_verifier) : undefined, refresh_token: f.refresh_token ? String(f.refresh_token) : undefined });
  return NextResponse.json(out, { status: 'error' in out ? 400 : 200, headers: { ...cors, 'Cache-Control': 'no-store' } });
}
export async function OPTIONS(req: Request) { return new Response(null, { status: 204, headers: panelCors(req) }); }
