import { notFound } from 'next/navigation';
import { projectBranding } from '@/lib/branding';
import { LoginScreen } from '@/components/LoginScreen';
import { sendSignInLink } from '@/lib/auth/sendLink';

// A client's own sign-in page, in the look the studio chose for them.
export default async function ClientLogin({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ next?: string; sent?: string; error?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const b = await projectBranding(slug);
  if (!b) notFound();
  const next = sp.next?.startsWith('/') ? sp.next : `/p/${slug}`;
  return (
    <LoginScreen b={b}>
      {sp.sent ? <p className="ls-msg">Check your email for a sign-in link. It works once, for the next hour.</p> : <form action={sendSignInLink} className="ls-form">
        <label htmlFor="email">Your work email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="ls-in" />
        <input type="hidden" name="next" value={next} /><input type="hidden" name="back" value={`/login/${slug}`} /><input type="hidden" name="brand" value={slug} />
        <button className="ls-btn" type="submit">Email me a sign-in link</button>
        {sp.error ? <p className="ls-msg">{sp.error === 'wait' ? 'Too many sign-in emails in a short time. Wait a minute, then try again.' : 'That didn’t work. Check the address and try again.'}</p> : null}
        <p className="ls-fine">No password needed. If you haven’t been invited yet, ask your team’s admin.</p>
      </form>}
    </LoginScreen>
  );
}
