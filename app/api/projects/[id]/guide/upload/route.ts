import { teamGate } from '@/lib/studioTeam';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { adminClient, requireStaff } from '@/lib/supabase/server';

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

// Studio uploads an image or a short video to use in a guideline block. Kept across rebuilds.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'guidelines'); if (gate) return gate; }
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file received.' }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Use a PNG, JPG, WebP, GIF or SVG image, or an MP4 or WebM video.' }, { status: 400 });
  const video = file.type.startsWith('video/');
  if (file.size > (video ? 40 : 4) * 1024 * 1024) return NextResponse.json({ error: video ? 'Videos must be under 40 MB. Export a shorter or smaller loop.' : 'Images must be under 4 MB.' }, { status: 400 });
  const path = `${id}/guide/uploads/${randomUUID()}.${ext}`;
  const sb = adminClient();
  const { error } = await sb.storage.from('previews').upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data } = await sb.storage.from('previews').createSignedUrl(path, 6 * 3600);
  return NextResponse.json({ path, url: data?.signedUrl });
}
