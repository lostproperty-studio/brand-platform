import { NextResponse } from 'next/server';
import { portalV2 } from '@/lib/portalVersion';
import { panelCors, refreshByLink } from '@/lib/plugins/panelAuth';

// New tokens for a panel that signed in by link (its refresh token works once; each use gives a new one)
export async function POST(req: Request) {
  if (!portalV2()) return new Response('Not found', { status: 404 });
  const cors = panelCors(req);
  const b = await req.json().catch(() => ({})) as { refresh_token?: string };
  if (!b.refresh_token) return new Response('Bad request', { status: 400, headers: cors });
  const out = await refreshByLink(String(b.refresh_token));
  return NextResponse.json(out, { status: 'error' in out ? 400 : 200, headers: { ...cors, 'Cache-Control': 'no-store' } });
}
export async function OPTIONS(req: Request) { return new Response(null, { status: 204, headers: panelCors(req) }); }
