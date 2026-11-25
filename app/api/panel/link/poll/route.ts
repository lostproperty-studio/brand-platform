import { NextResponse } from 'next/server';
import { portalV2 } from '@/lib/portalVersion';
import { pollLink } from '@/lib/plugins/panelLink';
import { panelCors } from '@/lib/plugins/panelAuth';

// The waiting panel asks whether its sign-in has been approved
export async function POST(req: Request) {
  if (!portalV2()) return new Response('Not found', { status: 404 });
  const cors = panelCors(req);
  const b = await req.json().catch(() => ({})) as { id?: string; poll?: string };
  if (!b.id || !b.poll) return new Response('Bad request', { status: 400, headers: cors });
  return NextResponse.json(await pollLink(String(b.id), String(b.poll)), { headers: { ...cors, 'Cache-Control': 'no-store' } });
}
export async function OPTIONS(req: Request) { return new Response(null, { status: 204, headers: panelCors(req) }); }
