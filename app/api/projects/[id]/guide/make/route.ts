import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { kreaKey, kreaMake } from '@/lib/krea';

export const maxDuration = 300;

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/mp4': 'm4a' };

// Make an image, video or sound with Krea, straight into the guidelines: Krea's agent makes it on the studio's
// plan, and the result is stored with the project's other uploads.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'guidelines'); if (gate) return gate; }
  const b = z.object({ prompt: z.string().min(3).max(4000), kind: z.enum(['image', 'video', 'audio']), aspect: z.string().max(10).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Describe what to make.' }, { status: 400 });
  const key = await kreaKey();
  if (!key) return NextResponse.json({ error: 'Krea isn’t connected. An admin can connect it in Admin settings.' }, { status: 402 });
  const { prompt, kind, aspect } = b.data;
  const ask = `Make exactly one ${kind}${aspect && kind !== 'audio' ? ` in ${aspect} aspect ratio` : ''}${kind === 'video' ? ', a short seamless loop' : ''}. ${prompt}\nDon't add text, logos or watermarks unless asked. Don't ask questions; make your best version and finish.`;
  try {
    const out = await kreaMake(key, ask, kind);
    if (!out.length) return NextResponse.json({ error: 'Krea finished without making anything. Try rewording it.' }, { status: 502 });
    const sb = adminClient();
    const res = await fetch(out[0].url); if (!res.ok) throw new Error('Couldn’t fetch the result from Krea.');
    const type = (res.headers.get('content-type') || out[0].mime || '').split(';')[0];
    const ext = EXT[type] || (kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : 'png');
    const bytes = new Uint8Array(await res.arrayBuffer());
    const path = `${id}/guide/uploads/krea-${randomUUID()}.${ext}`;
    const { error } = await sb.storage.from('previews').upload(path, bytes, { contentType: type || undefined });
    if (error) throw new Error(error.message);
    const { data } = await sb.storage.from('previews').createSignedUrl(path, 6 * 3600);
    return NextResponse.json({ path, url: data?.signedUrl, kind, type });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Krea couldn’t make that just now.' }, { status: 500 });
  }
}
