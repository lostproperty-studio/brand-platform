import { sendSignInLink } from '@/lib/auth/sendLink';

// Email magic link for everyone: studio staff and client users. What you can see depends on who you are.
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; sent?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="auth">
      <form action={sendSignInLink}>
        <div className="bp-mark"><img src="/lp-logo.svg" alt="Lost Property" /><span className="bp-sub">Brand Platform</span></div>
        <h1>Sign in</h1>
        {sp.sent ? <p>Check your email for a sign-in link.</p> : <>
          <label htmlFor="email" className="mute">Email</label>
          <input id="email" name="email" type="email" required className="in" autoComplete="email" />
          <input type="hidden" name="next" value={sp.next || '/'} /><input type="hidden" name="back" value="/login" />
          <button className="btn solid" type="submit">Email me a link</button>
          {sp.error ? <p className="mute">{sp.error === 'wait' ? 'Too many sign-in emails in a short time. Wait a minute, then try again.' : 'That didn’t work. Check the address and try again.'}</p> : null}
        </>}
      </form>
    </main>
  );
}
