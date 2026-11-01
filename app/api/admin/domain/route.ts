import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';
import { addToVercel, checkDomain, DEFAULT_HOST, getDomain } from '@/lib/domain';

export const runtime = 'nodejs';

// The platform's domain: what's saved, and a live check of each setup step
export async function GET() {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  const saved = await getDomain();
  const host = saved?.host || DEFAULT_HOST;
  const check = await checkDomain(host);
  const live = check.dns && check.serving;
  if (saved && saved.live !== live) await adminClient().from('studio_settings').upsert({ key: 'domain', value: { ...saved, live, checkedAt: new Date().toISOString() }, updated_at: new Date().toISOString() });
  return NextResponse.json({ host, saved: !!saved, live, ...check });
}

const Body = z.object({ host: z.string().regex(/^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i), addToVercel: z.boolean().optional() });
export async function PUT(req: Request) {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'That doesn’t look like a domain, e.g. brand.lostproperty.studio' }, { status: 400 });
  const host = b.data.host.toLowerCase();
  if (b.data.addToVercel) { try { await addToVercel(host); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); } }
  const check = await checkDomain(host);
  await adminClient().from('studio_settings').upsert({ key: 'domain', value: { host, live: check.dns && check.serving, checkedAt: new Date().toISOString() }, updated_at: new Date().toISOString() });
  return NextResponse.json({ host, saved: true, live: check.dns && check.serving, ...check });
}
