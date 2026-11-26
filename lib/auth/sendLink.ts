'use server';
import { safeBack, safeNext } from '@/lib/safeNext';
import { allow, allowAll, clientIp } from '@/lib/rateLimit';
import { appOrigin } from '@/lib/origin';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
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
  const next = safeNext(form.get('next'));
  const back = safeBack(form.get('back'));
  const slug = String(form.get('brand') || '') || next.match(/^\/p\/([^/]+)/)?.[1] || '';
  const jar = await cookies();
  const done = (q: string) => redirect(`${back}${back.includes('?') ? '&' : '?'}${q}&next=${encodeURIComponent(next)}`);
  // Limits on sign-in emails, whoever they're for: a few per address and a generous number per connection, so
  // nobody's inbox can be flooded and the email quota can't be run down. Same message whether or not they have access.
  const ip = await clientIp();
  if (!(await allowAll([[`signin:email:${email}`, 5, 600], [`signin:ip:${ip}`, 40, 3600]]))) done('error=wait');
  // Only people with access get a link; everyone else sees exactly the same response (page and cookie), so it
  // doesn't reveal who has an account
  if (!(await mayGetLink(email, back))) {
    jar.set('lp_signin', email, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 3600 });
    done('sent=1');
  }
  let failed = false, reason = '';
  let sent = false;
  if (emailProvider()) {
    try {
      const { url, code } = await signInUrl(email, next);
      const b = slug ? await clientBrand(slug) : studioBrand();
      await sendEmail({ to: email, ...signInEmail(b, url, code) });
      sent = true; await clearEmailError();
    } catch (e) { await noteEmailError('sign-in', e); }
  }
  // If the branded email couldn't go, Supabase's plain one still gets people in
  if (!sent) {
    const sb = await userClient();
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${await appOrigin()}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true } });
    if (error) { failed = true; reason = /rate|limit|seconds/i.test(error.message) ? 'wait' : ''; console.error('[sign-in] supabase:', error.message); }
  }
  // Remember who asked (only on this device, never in the page), so the code from the email can be typed in here
  if (!failed) jar.set('lp_signin', email, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 3600 });
  redirect(`${back}${back.includes('?') ? '&' : '?'}${failed ? `error=${reason || '1'}` : 'sent=1'}&next=${encodeURIComponent(next)}`);
}

/** Signs in with the 6-digit code from the sign-in email: for the iOS app, or when the link opens on another device */
export async function signInWithCode(form: FormData) {
  const code = String(form.get('code') || '').replace(/\D/g, '');
  const next = safeNext(form.get('next'));
  const back = safeBack(form.get('back'));
  const jar = await cookies();
  const email = jar.get('lp_signin')?.value || '';
  const again = `${back}${back.includes('?') ? '&' : '?'}next=${encodeURIComponent(next)}`;
  if (!email) redirect(`${again}&error=expired`);
  // Wrong codes: after a handful for one address, that sign-in is over and a new email is needed (stops guessing)
  if (!(await allow(`signin:code:${email}`, 8, 900))) { jar.delete('lp_signin'); redirect(`${again}&error=expired`); }
  const sb = await userClient();
  let { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) ({ error } = await sb.auth.verifyOtp({ email, token: code, type: 'magiclink' }));
  if (error) redirect(`${again}&sent=1&error=code`);
  jar.delete('lp_signin');
  redirect(next);
}
