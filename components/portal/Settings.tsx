'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TeamManager } from '@/components/TeamManager';
import { Requests } from '@/components/portal/Requests';

// Client admin settings: connect their own Anthropic key (route 1) and get a connector for their own Claude (route 3).
export function PortalSettings({ slug, hint, rejected, isAdmin, usage }: { slug: string; hint: string | null; rejected?: boolean; isAdmin: boolean; usage: { requests: number; input: number; output: number } | null }) {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  const [conn, setConn] = useState<{ url: string; note: string } | null>(null);
  async function save() {
    setMsg('Checking the key…');
    const r = await fetch(`/api/p/${slug}/ai-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key.trim() }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'That didn’t work.'); return; }
    setKey(''); setMsg('Connected. Canvas and Ask are ready.'); router.refresh();
  }
  async function disconnect() { await fetch(`/api/p/${slug}/ai-key`, { method: 'DELETE' }); setMsg('Disconnected.'); router.refresh(); }
  async function connector() { const r = await fetch(`/api/p/${slug}/connector`, { method: 'POST' }); if (r.ok) setConn(await r.json()); }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="pt-h2" style={{ margin: 0 }}>Your team</h2>
        <p className="mute" style={{ margin: 0 }}>Everyone signs in with their own email, so their questions and saved work stay their own.</p>
        <TeamManager slug={slug} />
      </section>
      {isAdmin ? <>
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="pt-h2" style={{ margin: 0 }}>Connect AI</h2>
        <p className="mute" style={{ margin: 0 }}>Canvas and Ask run on your own Anthropic account, so usage is billed to you and you set the limit.</p>
        <ol className="mute" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Sign in at platform.claude.com, add billing and set a monthly spend limit.</li>
          <li>Create an API key and choose one workspace for it.</li>
          <li>Paste it below. It’s checked, stored encrypted and never shown again.</li>
        </ol>
        {hint && rejected ? <p role="alert" style={{ margin: 0, color: '#B3261E' }}>Anthropic rejected the key ending {hint}: it may have been revoked or deleted, so Ask and the AI tools aren’t working. Paste a new key below.</p> : null}
        {hint ? <p style={{ margin: 0 }}>{rejected ? 'Saved' : 'Connected'} · key ending {hint} <button className="btn" onClick={disconnect}>Disconnect</button></p> : null}
        <div className="row"><label className="sr" htmlFor="k">Anthropic API key</label><input id="k" className="in" type="password" autoComplete="off" placeholder={hint ? 'Paste a new key to replace it' : 'sk-ant-…'} value={key} onChange={(e) => setKey(e.target.value)} style={{ flex: 1, minWidth: 200 }} /><button className="btn solid" disabled={key.trim().length < 20} onClick={save}>{hint ? 'Replace key' : 'Connect'}</button></div>
        {msg ? <p className="mute" role="status" style={{ margin: 0 }}>{msg}</p> : null}
        {usage ? <div className="tm-row" style={{ marginTop: 4 }}><div style={{ flex: 1 }}><p style={{ margin: 0 }}>Last 30 days: {usage.requests} AI request{usage.requests === 1 ? '' : 's'}</p><p className="mute" style={{ margin: 0 }}>{(usage.input + usage.output).toLocaleString('en-GB')} tokens. Billing and spend limits are in your Anthropic account.</p></div><a className="btn" href="https://platform.claude.com/settings/billing" target="_blank" rel="noopener">Billing ↗</a></div> : null}
      </section>
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="pt-h2" style={{ margin: 0 }}>Use the brand in your own Claude</h2>
        <p className="mute" style={{ margin: 0 }}>Adds these guidelines to Claude as a custom connector, so it can answer and design on-brand anywhere you use it.</p>
        <div className="row"><button className="btn" onClick={connector}>{conn ? 'Make a new link' : 'Create connector link'}</button></div>
        {conn ? <><input className="in" readOnly value={conn.url} onFocus={(e) => e.target.select()} aria-label="Connector URL" /><p className="mute" style={{ margin: 0 }}>{conn.note}</p></> : null}
      </section>
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="pt-h2" style={{ margin: 0 }}>Requests to Lost Property</h2>
        <p className="mute" style={{ margin: 0 }}>Ask for changes to the guidelines, new assets, hosting on your own domain, or anything else.</p>
        <Requests slug={slug} />
      </section>
      </> : null}
    </div>
  );
}
