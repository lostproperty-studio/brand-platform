import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, currentUser } from '@/lib/supabase/server';

// The iOS app registers the phone for notifications here, after the person allows them. Works before migration 0016
// has run (it just doesn't store anything yet).
const Body = z.object({ token: z.string().min(16).max(400), platform: z.enum(['ios']).default('ios'), version: z.string().max(40).optional() });

export async function POST(req: Request) {
  const user = await currentUser(); if (!user) return new Response('Sign in required', { status: 401 });
  const b = Body.safeParse(await req.json().catch(() => ({}))); if (!b.success) return new Response('Bad request', { status: 400 });
  const { error } = await adminClient().from('app_devices').upsert({ token: b.data.token, user_id: user.id, platform: b.data.platform, app_version: b.data.version || null, last_seen_at: new Date().toISOString() });
  return NextResponse.json({ ok: !error });
}

export async function DELETE(req: Request) {
  const user = await currentUser(); if (!user) return new Response('Sign in required', { status: 401 });
  const token = new URL(req.url).searchParams.get('token') || '';
  await adminClient().from('app_devices').delete().eq('token', token).eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
