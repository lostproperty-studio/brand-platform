import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';

// Showcase media: signed links to upload images and MP4s straight to storage (no server size limit), and to view them.
const safe = (s: string) => s.normalize('NFKD').replace(/[^\w.\-]+/g, '-').slice(-100) || 'file';
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sign'), name: z.string().max(200), type: z.string().max(100) }),
  z.object({ action: z.literal('view'), paths: z.array(z.string().max(400)).max(200) })
]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const sb = adminClient();
  if (b.data.action === 'sign') {
    if (!/^(image\/(jpeg|png|webp|gif|svg\+xml)|video\/mp4)$/.test(b.data.type)) return NextResponse.json({ error: 'Use a JPG, PNG, WebP, GIF, SVG or MP4.' }, { status: 400 });
    const path = `${id}/showcase/${Date.now().toString(36)}-${safe(b.data.name)}`;
    const { data, error } = await sb.storage.from('previews').createSignedUploadUrl(path, { upsert: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ path, signedUrl: data.signedUrl });
  }
  const paths = b.data.paths.filter((p) => p.startsWith(`${id}/showcase/`));
  if (!paths.length) return NextResponse.json({ urls: {} });
  const { data } = await sb.storage.from('previews').createSignedUrls(paths, 6 * 3600);
  return NextResponse.json({ urls: Object.fromEntries((data || []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl])) });
}
