'use client';
import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';

// Admin settings → Slack: one button that posts a test message to the studio's channel and says plainly what's
// wrong if it can't (no token, the app isn't in the channel, the wrong channel ID…)
export function AdminSlack() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null);
  async function test() {
    setBusy(true); setRes(null);
    const r = await fetch('/api/admin/slack', { method: 'POST' });
    setRes(r.ok ? await r.json() : { ok: false, message: 'Couldn’t run the test. Try again.' });
    setBusy(false);
  }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
    <button type="button" className="btn ic" onClick={test} disabled={busy}>{busy ? <Loader2 size={14} className="spin" aria-hidden /> : <Send size={14} strokeWidth={1.75} aria-hidden />}Send a test message</button>
    {res ? <p role="status" style={{ margin: 0, color: res.ok ? '#2e6b3a' : '#b3261e' }}>{res.message}</p> : null}
  </div>;
}
