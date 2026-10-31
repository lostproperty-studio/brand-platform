'use server';
import { redirect } from 'next/navigation';
import { userClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

/** Emails a sign-in link, then shows "check your email" on the same page. */
export async function sendSignInLink(form: FormData) {
  const email = String(form.get('email') || '').trim().toLowerCase();
  const next = String(form.get('next') || '/');
  const back = String(form.get('back') || '/login');
  const sb = await userClient();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${env.appUrl()}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true } });
  redirect(`${back}${back.includes('?') ? '&' : '?'}${error ? 'error=1' : 'sent=1'}&next=${encodeURIComponent(next)}`);
}
