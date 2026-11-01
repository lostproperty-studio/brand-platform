import { redirect } from 'next/navigation';
import { adminClient, userClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { AutoSubmit } from '@/components/AutoSubmit';

// Finishes sign-in from an email the platform sent. The link only signs in when this page submits, so email
// scanners that open links in advance can't use it up.
export default async function Verify({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; next?: string; failed?: string }> }) {
  const sp = await searchParams;
  async function finish(form: FormData) {
    'use server';
    const token_hash = String(form.get('token_hash') || '');
    const next = String(form.get('next') || '/');
    const sb = await userClient();
    const { data, error } = await sb.auth.verifyOtp({ token_hash, type: 'magiclink' });
    if (error || !data.user) redirect(`/auth/verify?failed=1&next=${encodeURIComponent(next)}`);
    const u = data.user;
    if (u.email && env.studioDomains().includes(u.email.split('@')[1])) await adminClient().from('staff').upsert({ user_id: u.id, email: u.email }, { onConflict: 'user_id', ignoreDuplicates: true });
    redirect(next.startsWith('/') ? next : '/');
  }
  const next = sp.next?.startsWith('/') ? sp.next : '/';
  const portal = next.match(/^\/p\/([^/]+)/)?.[1];
  if (sp.failed || !sp.token_hash) return (
    <main className="auth"><div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 340 }}>
      <img src="/lp-logo.svg" alt="Lost Property" width={64} />
      <h1>That link has expired</h1>
      <p className="mute">Sign-in links work once, for an hour. Ask for a new one and it’ll arrive in a moment.</p>
      <a className="btn solid" href={portal ? `/login/${portal}?next=${encodeURIComponent(next)}` : `/login?next=${encodeURIComponent(next)}`}>Email me a new link</a>
    </div></main>
  );
  return (
    <main className="auth"><form action={finish} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
      <img src="/lp-logo.svg" alt="Lost Property" width={64} />
      <p>Signing you in…</p>
      <input type="hidden" name="token_hash" value={sp.token_hash} /><input type="hidden" name="next" value={next} />
      <button className="btn solid" type="submit">Continue</button>
      <AutoSubmit />
    </form></main>
  );
}
