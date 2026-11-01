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
    const studio = !!u?.email && env.studioDomains().includes(u.email.split('@')[1]);
    if (u?.email && studio) {
      await adminClient().from('staff').upsert({ user_id: u.id, email: u.email }, { onConflict: 'user_id', ignoreDuplicates: true });
    }
    // Google sign-in is for the studio: Workspace accounts, or members added in Admin settings. Anyone else signs in by email.
    if (u && url.searchParams.get('via') === 'google' && !studio) {
      const { data: st } = await adminClient().from('staff').select('*').eq('user_id', u.id).maybeSingle();
      if (!st || (st as { active?: boolean }).active === false) {
        await sb.auth.signOut();
        return NextResponse.redirect(new URL('/login?error=google-team', await appOrigin()));
      }
    }
  }
  return NextResponse.redirect(new URL(next.startsWith('/') ? next : '/', await appOrigin()));
}
