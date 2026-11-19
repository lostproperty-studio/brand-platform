import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { portalV2 } from '@/lib/portalVersion';
import { appOrigin } from '@/lib/origin';
import { panelCaller, panelCors } from '@/lib/plugins/panelAuth';
import { panelBrand } from '@/lib/plugins/panelData';

// Everything the LP panel shows, for the client it's signed in to
export async function GET(req: Request) {
  if (!portalV2()) return new Response('Not found', { status: 404 });
  const cors = panelCors(req);
  const who = await panelCaller(req);
  if (!who) return new Response('Sign in again', { status: 401, headers: cors });
  const { data: p } = await adminClient().from('projects').select('slug').eq('id', who.projectId).maybeSingle();
  const brand = await panelBrand(who.projectId, p?.slug || '', who.staff, await appOrigin());
  if (!brand) return new Response('This brand hasn’t been published yet.', { status: 409, headers: cors });
  return NextResponse.json(brand, { headers: { ...cors, 'Cache-Control': 'private, no-store' } });
}
export async function OPTIONS(req: Request) { return new Response(null, { status: 204, headers: panelCors(req) }); }
