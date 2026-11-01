'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2 } from 'lucide-react';

// The portal's address: <domain>/<slug>. Changing it changes the link clients use.
export function PortalAddress({ projectId, host, slug }: { projectId: string; host: string; slug: string }) {
  const router = useRouter();
  const [v, setV] = useState(slug);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    const s = v.trim().toLowerCase(); if (s === slug) return;
    setBusy(true); setMsg('');
    const r = await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: s }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error || 'Couldn’t change the address.'); return; }
    setMsg('Saved. Links shared before still need updating.'); router.refresh();
  }
  return (
    <div className="ov-card">
      <h3 className="ov-h"><Link2 size={16} strokeWidth={1.75} aria-hidden />Portal address</h3>
      <p className="mute" style={{ margin: 0 }}>Where clients find their portal. Changing it breaks links you’ve already shared.</p>
      <div className="pa-row"><span className="pa-host">{host}/</span><input className="in pa-in" value={v} onChange={(e) => setV(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} onKeyDown={(e) => e.key === 'Enter' && save()} aria-label="Portal address" spellCheck={false} /><button className="btn solid" disabled={busy || v === slug} onClick={save}>Save</button></div>
      {msg ? <p className="mute" role="status" style={{ margin: 0 }}>{msg}</p> : null}
    </div>
  );
}
