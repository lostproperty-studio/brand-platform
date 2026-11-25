import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/apps/server';
import { BUCKET, photoAccess, photoPrefix } from '@/lib/photographer/server';
import { kreaKey, kreaMake } from '@/lib/krea';

export const maxDuration = 300;
export const runtime = 'nodejs';
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// Making an image in the brand's photographic style with Krea. Like Director, it runs on the studio's Krea plan
// while in Labs, so it's studio-only until clients connect their own Krea account.
const Body = z.object({ prompt: z.string().min(3).max(3000), style: z.string().max(3000).default(''), aspect: z.string().max(6).default('4:5') });
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const a = await photoAccess((await ctx.params).slug); if (!a) return new Response('Not found', { status: 404 });
  if (!a.acc.staff) return NextResponse.json({ error: 'Generating needs your own Krea account, which you’ll be able to connect in Settings soon.' }, { status: 402 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Describe the picture.' }, { status: 400 });
  const key = await kreaKey();
  if (!key) return NextResponse.json({ error: 'Krea isn’t connected. An admin can connect it in Admin settings.' }, { status: 402 });
  const { prompt, style, aspect } = b.data;
  const ask = `Make exactly one photograph in ${aspect} aspect ratio. ${prompt}${style ? `\nPhotographic style to follow: ${style}` : ''}\nNo text, captions, logos or watermarks in the picture. Don't ask questions; make your best version and finish.`;
  try {
    const out = await kreaMake(key, ask, 'image');
    if (!out.length) return NextResponse.json({ error: 'Krea finished without making anything. Try rewording it.' }, { status: 502 });
    const res = await fetch(out[0].url); if (!res.ok) throw new Error('Couldn’t fetch the result from Krea.');
    const type = (res.headers.get('content-type') || out[0].mime || 'image/png').split(';')[0];
    const path = `${photoPrefix(a.p.id)}gen-${randomUUID()}.${EXT[type] || 'png'}`;
    const { error } = await db().storage.from(BUCKET).upload(path, new Uint8Array(await res.arrayBuffer()), { contentType: type });
    if (error) throw new Error(error.message);
    const { data } = await db().storage.from(BUCKET).createSignedUrl(path, 6 * 3600);
    return NextResponse.json({ path, url: data?.signedUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Krea couldn’t make that just now.' }, { status: 500 });
  }
}
