import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/apps/server';
import { BUCKET, photoAccess, photoPrefix } from '@/lib/photographer/server';
import { signMany } from '@/lib/storage/signed';

export const runtime = 'nodejs';
const safe = (n: string) => n.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(-60) || 'image';

// Photographer's images in storage: an upload link (big files go straight to storage), or fresh view links
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sign'), name: z.string().max(200), type: z.string().max(100) }),
  z.object({ action: z.literal('view'), paths: z.array(z.string().max(300)).max(500) })
]);
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const a = await photoAccess((await ctx.params).slug); if (!a) return new Response('Not found', { status: 404 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const pre = photoPrefix(a.p.id);
  if (b.data.action === 'sign') {
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(b.data.type)) return NextResponse.json({ error: 'Use JPG, PNG, WebP or AVIF images.' }, { status: 400 });
    const path = `${pre}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${safe(b.data.name)}`;
    const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ path, signedUrl: data.signedUrl });
  }
  const paths = [...new Set(b.data.paths.filter((p) => p.startsWith(pre)))];
  if (!paths.length) return NextResponse.json({ urls: {} });
  const urls: Record<string, string> = {};
  for (let i = 0; i < paths.length; i += 100) { const { data } = await signMany(BUCKET, paths.slice(i, i + 100), 6 * 3600); for (const d of data || []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl; }
  return NextResponse.json({ urls });
}
