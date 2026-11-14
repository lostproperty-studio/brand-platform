import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BUCKET, db, directorAccess, mediaPrefix } from '@/lib/director/server';
import { signMany } from '@/lib/storage/signed';

export const runtime = 'nodejs';
const safe = (n: string) => n.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(-60) || 'file';

// Uploading the team's own footage, stills and sound straight to storage (big files skip the server), and fresh
// view links for media already in a file
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sign'), name: z.string().max(200), type: z.string().max(100) }),
  z.object({ action: z.literal('view'), paths: z.array(z.string().max(300)).max(100) })
]);
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const a = await directorAccess((await ctx.params).slug); if (!a) return new Response('Not found', { status: 404 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const pre = mediaPrefix(a.p.id);
  if (b.data.action === 'sign') {
    if (!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|webm)|audio\/(mpeg|mp3|wav|x-wav|mp4|x-m4a|aac))$/.test(b.data.type)) return NextResponse.json({ error: 'Use video (MP4, MOV, WebM), images (JPG, PNG, WebP) or sound (MP3, WAV, M4A).' }, { status: 400 });
    const path = `${pre}uploads/${Date.now().toString(36)}-${safe(b.data.name)}`;
    const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ path, signedUrl: data.signedUrl });
  }
  const paths = b.data.paths.filter((p) => p.startsWith(pre));
  if (!paths.length) return NextResponse.json({ urls: {} });
  const { data } = await signMany(BUCKET, paths, 6 * 3600);
  return NextResponse.json({ urls: Object.fromEntries((data || []).filter((d) => d.path).map((d) => [d.path!, d.signedUrl])) });
}
