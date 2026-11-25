import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { adminClient } from '@/lib/supabase/server';
import { betaAccess, portalLine, setMainPortal } from '@/lib/portalVersionServer';
import { PORTALS } from '@/lib/portalVersion';

export const dynamic = 'force-dynamic';

// The portal versions: which is main, which is in beta, and which clients have the beta
export async function GET() {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  const line = await portalLine();
  const { data: projects } = await adminClient().from('projects').select('id, slug, client, status').neq('status', 'archived').order('client');
  const access = await betaAccess((projects || []).map((p) => p.id));
  return NextResponse.json({ ...line, portals: PORTALS, staging: process.env.PORTAL_V2 === '1', projects: (projects || []).map((p) => ({ ...p, access: access[p.id] })) });
}

// Make the beta the main portal (every client gets it), or go back to the one before
export async function POST(req: Request) {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  const b = z.object({ main: z.number().int() }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: 'Which version?' }, { status: 400 });
  try { await setMainPortal(b.data.main); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  return NextResponse.json({ ok: true, ...(await portalLine()) });
}
