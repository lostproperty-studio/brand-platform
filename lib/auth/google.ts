'use server';
import { redirect } from 'next/navigation';
import { userClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { appOrigin } from '@/lib/origin';

/** Sign in with Google, for the studio team. Google is asked to show only lostproperty.studio accounts. */
export async function signInWithGoogle(form: FormData) {
  const next = String(form.get('next') || '/studio');
  const sb = await userClient();
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${await appOrigin()}/auth/callback?via=google&next=${encodeURIComponent(next.startsWith('/') ? next : '/studio')}`, queryParams: { hd: env.studioDomains()[0], prompt: 'select_account' } }
  });
  if (error || !data.url) redirect('/login?error=google');
  redirect(data.url);
}
