'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';

// Connecting the studio's Krea account, so the editor can make images and videos straight into a frame
export function AdminKrea() {
  const [s, setS] = useState<{ connected: boolean; hint: string | null } | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { fetch('/api/admin/krea').then((r) => r.json()).then(setS).catch(() => setS({ connected: false, hint: null })); }, []);
  const save = async () => { setBusy(true); setErr(''); const r = await fetch('/api/admin/krea', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }); const j = await r.json().catch(() => ({})); setBusy(false); if (!r.ok) { setErr(j.error || 'Couldn’t connect.'); return; } setS(j); setKey(''); };
  const remove = async () => { setBusy(true); await fetch('/api/admin/krea', { method: 'DELETE' }); setBusy(false); setS({ connected: false, hint: null }); };
  if (!s) return <p className="mute">Checking…</p>;
  return <div className="adm-krea">
    {s.connected ? <p className="adm-ok"><CheckCircle2 size={16} strokeWidth={1.75} aria-hidden />Connected (key ending {s.hint}). Make an image or video from any frame’s fill.</p>
      : <p className="mute" style={{ margin: 0 }}>Make images and videos in the editor with Krea. It runs on the studio’s Krea plan.</p>}
    <div className="row">
      <input className="in" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={s.connected ? 'Paste a new key to replace it' : 'Paste a Krea API key'} aria-label="Krea API key" style={{ flex: 1 }} />
      <button className="btn solid" onClick={save} disabled={busy || key.trim().length < 10}>{busy ? <Loader2 size={15} className="spin" aria-hidden /> : null}{s.connected ? 'Replace' : 'Connect'}</button>
      {s.connected ? <button className="btn" onClick={remove} disabled={busy}>Disconnect</button> : null}
    </div>
    {err ? <p className="cd-err" role="alert">{err}</p> : null}
    <p className="mute" style={{ margin: 0, fontSize: 12 }}>Create a key in Krea under <a href="https://www.krea.ai/settings/api-tokens" target="_blank" rel="noreferrer">Settings → API tokens <ExternalLink size={11} aria-hidden /></a>. It’s stored encrypted.</p>
  </div>;
}
