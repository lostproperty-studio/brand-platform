import { NextResponse } from 'next/server';
import { listFiles, viewerOf } from '@/lib/apps/server';
import { BUCKET, photoAccess, photoPrefix } from '@/lib/photographer/server';
import { signMany } from '@/lib/storage/signed';
import type { Collection } from '@/lib/photographer/model';

export const runtime = 'nodejs';

// The library: every collection with its count and cover, and every image across them (for All images), with view links
export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const a = await photoAccess((await ctx.params).slug); if (!a) return new Response('Not found', { status: 404 });
  const { files, error } = await listFiles(a.p.id, 'photographer', viewerOf(a.acc), 500);
  const pre = photoPrefix(a.p.id);
  const all = files.flatMap((f) => ((f.data as Collection).images || []).map((im) => ({ ...im, collection: f.id, collectionTitle: f.title })));
  const paths = [...new Set(all.map((x) => x.path).filter((p) => p?.startsWith(pre)))];
  const urls: Record<string, string> = {};
  for (let i = 0; i < paths.length; i += 100) { const { data } = await signMany(BUCKET, paths.slice(i, i + 100), 6 * 3600); for (const d of data || []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl; }
  const collections = files.map((f) => { const ims = (f.data as Collection).images || []; const cover = ims.find((x) => x.id === (f.data as Collection).cover) || ims[ims.length - 1];
    return { id: f.id, title: f.title, status: f.status, updated_at: f.updated_at, count: ims.length, covers: [...ims].reverse().slice(0, 4).map((x) => urls[x.path]).filter(Boolean), cover: cover ? urls[cover.path] : null }; });
  return NextResponse.json({ collections, images: all.map((x) => ({ ...x, url: urls[x.path] })).sort((p, q) => q.added.localeCompare(p.added)), error, staff: a.acc.staff });
}
