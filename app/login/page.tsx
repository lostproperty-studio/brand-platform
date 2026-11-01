import { sendSignInLink } from '@/lib/auth/sendLink';
import { signInWithGoogle } from '@/lib/auth/google';

const GoogleG = () => <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>;

// Sign in. The studio team can use their Google Workspace account; everyone (clients too) can sign in by email.
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; sent?: string; error?: string }> }) {
  const sp = await searchParams;
  const google = process.env.GOOGLE_SIGNIN === 'on';
  return (
    <main className="auth">
      <div className="auth-box">
        <div className="bp-mark"><img src="/lp-logo.svg" alt="Lost Property" /><span className="bp-sub">Brand Platform</span></div>
        <h1>Sign in</h1>
        {sp.sent ? <p>Check your email for a sign-in link.</p> : <>
          {google ? <form action={signInWithGoogle} className="auth-google">
            <input type="hidden" name="next" value={sp.next && sp.next !== '/' ? sp.next : '/studio'} />
            <button className="btn auth-g" type="submit"><GoogleG />Continue with Google</button>
            <p className="mute auth-fine">For the Lost Property team</p>
            {sp.error === 'google-team' ? <p className="auth-err">Google sign-in is for the Lost Property team. If you’re a client, sign in with your email below.</p> : sp.error === 'google' ? <p className="auth-err">Google sign-in isn’t available right now. Use your email below.</p> : null}
          </form> : null}
          {google ? <div className="auth-or"><span>or</span></div> : null}
          <form action={sendSignInLink}>
            <label htmlFor="email" className="mute">Email</label>
            <input id="email" name="email" type="email" required className="in" autoComplete="email" />
            <input type="hidden" name="next" value={sp.next || '/'} /><input type="hidden" name="back" value="/login" />
            <button className="btn solid" type="submit">Email me a link</button>
            {sp.error && !sp.error.startsWith('google') ? <p className="mute">{sp.error === 'wait' ? 'Too many sign-in emails in a short time. Wait a minute, then try again.' : 'That didn’t work. Check the address and try again.'}</p> : null}
          </form>
        </>}
      </div>
    </main>
  );
}
