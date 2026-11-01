'use server';
import { redirect } from 'next/navigation';
import { userClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { emailProvider, sendEmail } from '@/lib/email/send';
import { clientBrand, studioBrand } from '@/lib/email/brand';
import { signInEmail } from '@/lib/email/templates';
import { signInUrl } from '@/lib/auth/links';

/** Emails a sign-in link, then shows "check your email" on the same page. With an email service set up the email
 *  is the platform's own, branded for the client whose portal it's for; otherwise Supabase sends its plain one. */
export async function sendSignInLink(form: FormData) {
  const email = String(form.get('email') || '').trim().toLowerCase();
  const next = String(form.get('next') || '/');
  const back = String(form.get('back') || '/login');
  const slug = String(form.get('brand') || '') || next.match(/^\/p\/([^/]+)/)?.[1] || '';
  let failed = false;
  if (emailProvider()) {
    try {
      const { url } = await signInUrl(email, next);
      const b = slug ? await clientBrand(slug) : studioBrand();
      await sendEmail({ to: email, ...signInEmail(b, url) });
    } catch (e) { console.error('[sign-in email]', e); failed = true; }
  } else {
    const sb = await userClient();
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${env.appUrl()}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true } });
    failed = !!error;
  }
  redirect(`${back}${back.includes('?') ? '&' : '?'}${failed ? 'error=1' : 'sent=1'}&next=${encodeURIComponent(next)}`);
}
