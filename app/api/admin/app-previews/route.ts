import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';
import { APP_PREVIEWS, FRAGMENTS } from '@/lib/portal/appPreviews';
import { getAppPreviews } from '@/lib/portal/appPreviewsServer';

export const runtime = 'nodejs';

// Admin settings → App previews: the wording and features on each app's About page. GET gives what's live and the
// defaults; PUT saves one app; DELETE ?app= puts one back to the default.
export async function GET() {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  return NextResponse.json({ previews: await getAppPreviews(), defaults: APP_PREVIEWS });
}

const ids = FRAGMENTS.map((f) => f.id) as [string, ...string[]];
const Body = z.object({
  app: z.enum(['writer', 'director', 'designer', 'photographer']),
  preview: z.object({
    teaser: z.string().trim().min(1).max(140), headline: z.string().trim().min(1).max(120), line: z.string().trim().max(300),
    features: z.array(z.object({ title: z.string().trim().min(1).max(60), text: z.string().trim().max(160), ui: z.enum(ids), expert: z.boolean().optional(), off: z.boolean().optional() })).max(24)
  })
});
async function stored() {
  const { data } = await adminClient().from('studio_settings').select('value').eq('key', 'app_previews').maybeSingle();
  return (data?.value || {}) as Record<string, unknown>;
}
export async function PUT(req: Request) {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Every feature needs a title, and lines must be short.' }, { status: 400 });
  const value = { ...(await stored()), [b.data.app]: b.data.preview };
  await adminClient().from('studio_settings').upsert({ key: 'app_previews', value, updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: Request) {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  const app = new URL(req.url).searchParams.get('app') || '';
  const value = await stored(); delete value[app];
  await adminClient().from('studio_settings').upsert({ key: 'app_previews', value, updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true, preview: APP_PREVIEWS[app as keyof typeof APP_PREVIEWS] || null });
}
