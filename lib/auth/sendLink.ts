'use server';
import { appOrigin } from '@/lib/origin';
import { redirect } from 'next/navigation';
import { userClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { emailProvider, sendEmail } from '@/lib/email/send';
import { clientBrand, studioBrand } from '@/lib/email/brand';
import { signInEmail } from '@/lib/email/templates';
import { signInUrl } from '@/lib/auth/links';
import { mayGetLink } from '@/lib/auth/allowed';
import { clearEmailError, noteEmailError } from '@/lib/email/status';

/** Emails a sign-in link, then shows "check your email" on the same page. With an email service set up the email
 *  is the platform's own, branded for the client whose portal it's for; otherwise Supabase sends its plain one. */
export async function sendSignInLink(form: FormData) {
  const email = String(form.get('email') || '').trim().toLowerCase();
  const next = String(form.get('next') || '/');
  const back = String(form.get('back') || '/login');
  const slug = String(form.get('brand') || '') || next.match(/^\/p\/([^/]+)/)?.[1] || '';
  // Only people with access get a link; everyone else sees the same message, so the page doesn't reveal who has an account
  if (!(await mayGetLink(email, back))) redirect(`${back}${back.includes('?') ? '&' : '?'}sent=1&next=${encodeURIComponent(next)}`);
  let failed = false, reason = '';
  let sent = false;
  if (emailProvider()) {
    try {
      const { url } = await signInUrl(email, next);
      const b = slug ? await clientBrand(slug) : studioBrand();
      await sendEmail({ to: email, ...signInEmail(b, url) });
      sent = true; await clearEmailError();
    } catch (e) { await noteEmailError('sign-in', e); }
  }
  // If the branded email couldn't go, Supabase's plain one still gets people in
  if (!sent) {
    const sb = await userClient();
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${await appOrigin()}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true } });
    if (error) { failed = true; reason = /rate|limit|seconds/i.test(error.message) ? 'wait' : ''; console.error('[sign-in] supabase:', error.message); }
  }
  redirect(`${back}${back.includes('?') ? '&' : '?'}${failed ? `error=${reason || '1'}` : 'sent=1'}&next=${encodeURIComponent(next)}`);
}
