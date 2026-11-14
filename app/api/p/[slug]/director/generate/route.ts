import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { BUCKET, db, directorAccess, mediaPrefix } from '@/lib/director/server';
import { kreaKey, kreaMake } from '@/lib/krea';
import { buildSnapshot } from '@/lib/projects/snapshot';

export const maxDuration = 300;
export const runtime = 'nodejs';
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/mp4': 'm4a' };

// Making a scene's picture, a bespoke music track or a sound effect with Krea. While Director is in Labs this runs
// on the studio's Krea plan, so it's studio-only; clients will connect their own Krea account before their beta.
const Body = z.object({ prompt: z.string().min(3).max(3000), kind: z.enum(['image', 'video', 'audio']), aspect: z.string().max(6).optional(), seconds: z.number().min(1).max(120).optional(), sound: z.enum(['music', 'sfx']).optional() });
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const a = await directorAccess((await ctx.params).slug); if (!a) return new Response('Not found', { status: 404 });
  if (!a.acc.staff) return NextResponse.json({ error: 'Generating needs your own Krea account, which you’ll be able to connect in Settings soon.' }, { status: 402 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Describe what to make.' }, { status: 400 });
  const key = await kreaKey();
  if (!key) return NextResponse.json({ error: 'Krea isn’t connected. An admin can connect it in Admin settings.' }, { status: 402 });
  const { prompt, kind, aspect, seconds, sound } = b.data;
  const snap = await buildSnapshot(a.p.id).catch(() => null);
  const look = snap?.design?.length ? `\nKeep to the brand's look: ${snap.design.slice(0, 6).join('; ')}.` : '';
  const ask = kind === 'audio'
    ? (sound === 'sfx' ? `Make exactly one short sound effect (under ${Math.max(1, Math.round(seconds || 2))} seconds): ${prompt}. No music, no voice.` : `Make exactly one instrumental music track, about ${Math.round(seconds || 15)} seconds long, for a short brand video: ${prompt}. No vocals.`)
    : `Make exactly one ${kind}${aspect ? ` in ${aspect} aspect ratio` : ''}${kind === 'video' ? `, about ${Math.min(10, Math.max(3, Math.round(seconds || 5)))} seconds, one continuous shot` : ''}. ${prompt}${look}\nNo text, captions, logos or watermarks in the picture. Don't ask questions; make your best version and finish.`;
  try {
    const out = await kreaMake(key, ask, kind);
    if (!out.length) return NextResponse.json({ error: 'Krea finished without making anything. Try rewording it.' }, { status: 502 });
    const res = await fetch(out[0].url); if (!res.ok) throw new Error('Couldn’t fetch the result from Krea.');
    const type = (res.headers.get('content-type') || out[0].mime || '').split(';')[0];
    const ext = EXT[type] || (kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : 'png');
    const path = `${mediaPrefix(a.p.id)}gen/${randomUUID()}.${ext}`;
    const { error } = await db().storage.from(BUCKET).upload(path, new Uint8Array(await res.arrayBuffer()), { contentType: type || undefined });
    if (error) throw new Error(error.message);
    const { data } = await db().storage.from(BUCKET).createSignedUrl(path, 6 * 3600);
    return NextResponse.json({ media: { path, kind, url: data?.signedUrl } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Krea couldn’t make that just now.' }, { status: 500 });
  }
}
