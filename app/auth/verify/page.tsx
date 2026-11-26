import { safeNext } from '@/lib/safeNext';
import { studioByDomain } from '@/lib/auth/studioDomain';
import { redirect } from 'next/navigation';
import { adminClient, currentUser, userClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

// Finishes sign-in from an email the platform sent. The link only signs in when the person presses Continue: work
// email security (Microsoft Defender Safe Links, Mimecast, Proofpoint) opens links in a real browser before the
// person does, so a page that signed in by itself would use the one-time link up and they'd see "expired".
export default async function Verify({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; next?: string; failed?: string }> }) {
  const sp = await searchParams;
  async function finish(form: FormData) {
    'use server';
    const token_hash = String(form.get('token_hash') || '');
    const next = String(form.get('next') || '/');
    const sb = await userClient();
    const { data, error } = await sb.auth.verifyOtp({ token_hash, type: 'magiclink' });
    // Pressed twice, or already signed in on this browser: carry on rather than calling the link expired
    if ((error || !data.user) && (await currentUser())) redirect(safeNext(next));
    if (error || !data.user) redirect(`/auth/verify?failed=1&next=${encodeURIComponent(next)}`);
    const u = data.user;
    if (studioByDomain(u)) await adminClient().from('staff').upsert({ user_id: u.id, email: u.email }, { onConflict: 'user_id', ignoreDuplicates: true });
    redirect(safeNext(next));
  }
  const next = safeNext(sp.next);
  const portal = next.match(/^\/p\/([^/]+)/)?.[1];
  if (sp.failed && (await currentUser())) redirect(next);
  if (sp.failed || !sp.token_hash) return (
    <main className="auth"><div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 340 }}>
      <img src="/lp-logo.svg" alt="Lost Property" width={64} />
      <h1>That link has expired</h1>
      <p className="mute">Sign-in links work once, for an hour, and only the newest email’s link works. Ask for a new one and press Continue on the page it opens.</p>
      <a className="btn solid" href={portal ? `/login/${portal}?next=${encodeURIComponent(next)}` : `/login?next=${encodeURIComponent(next)}`}>Email me a new link</a>
    </div></main>
  );
  return (
    <main className="auth"><form action={finish} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
      <img src="/lp-logo.svg" alt="Lost Property" width={64} />
      <h1>Sign in</h1>
      <p className="mute">Press Continue to finish signing in. This step stops email security checks from using your link before you do.</p>
      <input type="hidden" name="token_hash" value={sp.token_hash} /><input type="hidden" name="next" value={next} />
      <button className="btn solid" type="submit" autoFocus>Continue</button>
    </form></main>
  );
}
