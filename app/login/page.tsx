import { redirect } from 'next/navigation';
import { userClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

// Email magic link for everyone: studio staff and client users. What you can see depends on who you are.
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; sent?: string; error?: string }> }) {
  const sp = await searchParams;
  async function send(form: FormData) {
    'use server';
    const email = String(form.get('email') || '').trim().toLowerCase();
    const next = String(form.get('next') || '/');
    const sb = await userClient();
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${env.appUrl()}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true } });
    redirect(error ? `/login?error=1&next=${encodeURIComponent(next)}` : `/login?sent=1`);
  }
  return (
    <main className="auth">
      <form action={send}>
        <img src="/lp-logo.svg" alt="Lost Property" width={64} />
        <h1>Sign in</h1>
        {sp.sent ? <p>Check your email for a sign-in link.</p> : <>
          <label htmlFor="email" className="mute">Email</label>
          <input id="email" name="email" type="email" required className="in" autoComplete="email" />
          <input type="hidden" name="next" value={sp.next || '/'} />
          <button className="btn solid" type="submit">Email me a link</button>
          {sp.error ? <p className="mute">That didn’t work. Check the address and try again.</p> : null}
        </>}
      </form>
    </main>
  );
}
