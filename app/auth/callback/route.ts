import { appOrigin } from '@/lib/origin';
import { NextResponse } from 'next/server';
import { adminClient, userClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

// Finishes the magic-link sign-in. Staff are recognised by their email domain on first sign-in.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/';
  if (code) {
    const sb = await userClient();
    const { data } = await sb.auth.exchangeCodeForSession(code);
    const u = data.user;
    if (u?.email && env.studioDomains().includes(u.email.split('@')[1])) {
      await adminClient().from('staff').upsert({ user_id: u.id, email: u.email }, { onConflict: 'user_id', ignoreDuplicates: true });
    }
  }
  return NextResponse.redirect(new URL(next.startsWith('/') ? next : '/', await appOrigin()));
}
