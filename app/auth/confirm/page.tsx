'use client';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// Finishes sign-in from an invite email. Invite links carry the session in the URL fragment,
// which only the browser can read, so this page sets the session and moves on.
export default function Confirm() {
  const [msg, setMsg] = useState('Signing you in…');
  useEffect(() => {
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const params = new URLSearchParams(window.location.hash.slice(1));
    const next = new URLSearchParams(window.location.search).get('next') || '/';
    const go = () => window.location.replace(next.startsWith('/') ? next : '/');
    const access_token = params.get('access_token'), refresh_token = params.get('refresh_token');
    const code = new URLSearchParams(window.location.search).get('code');
    (async () => {
      if (access_token && refresh_token) { const { error } = await sb.auth.setSession({ access_token, refresh_token }); if (!error) return go(); }
      if (code) { const { error } = await sb.auth.exchangeCodeForSession(code); if (!error) return go(); }
      const err = params.get('error_description');
      setMsg(err ? `That link didn’t work: ${err}. Ask for a new invite, or sign in with your email.` : 'That link has expired. Sign in with your email to continue.');
    })();
  }, []);
  return <main className="auth"><div style={{ maxWidth: 320 }}><img src="/lp-logo.svg" alt="Lost Property" width={64} /><p>{msg}</p><a className="btn" href="/login">Sign in</a></div></main>;
}
