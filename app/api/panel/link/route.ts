import { NextResponse } from 'next/server';
import { allow, clientIp } from '@/lib/rateLimit';
import { portalV2 } from '@/lib/portalVersion';
import { appOrigin } from '@/lib/origin';
import { createLink, LINK_HOSTS } from '@/lib/plugins/panelLink';
import { panelCors } from '@/lib/plugins/panelAuth';
import type { PanelHost } from '@/lib/plugins/catalog';

// A panel starts signing in: it gets a short code to show, the page to open, and a secret to ask with
export async function POST(req: Request) {
  if (!portalV2()) return new Response('Not found', { status: 404 });
  const cors = panelCors(req);
  const b = await req.json().catch(() => ({})) as { host?: string; hint?: string };
  if (!LINK_HOSTS.includes(b.host as PanelHost)) return new Response('Bad request', { status: 400, headers: cors });
  // Anyone can start one, so a limit per connection keeps it from being used to mint links in bulk
  if (!(await allow(`panel-link:ip:${await clientIp()}`, 30, 3600))) return new Response('Too many requests', { status: 429, headers: cors });
  try {
    const l = await createLink(b.host as PanelHost, b.hint);
    return NextResponse.json({ id: l.id, poll: l.poll, words: l.words, url: `${await appOrigin()}/panel/link/${l.id}` }, { headers: { ...cors, 'Cache-Control': 'no-store' } });
  } catch (e) { return new Response((e as Error).message, { status: 503, headers: cors }); }
}
export async function OPTIONS(req: Request) { return new Response(null, { status: 204, headers: panelCors(req) }); }
