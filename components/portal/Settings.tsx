'use client';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { TeamManager } from '@/components/TeamManager';
import { Requests } from '@/components/portal/Requests';

// Client settings, laid out like Resources: a section each, divided by hairlines. Managers see the team; admins also
// connect AI and see its usage, get a connector for their own Claude, choose storage and send requests to Lost Property.
function Sec({ id, title, line, children }: { id: string; title: ReactNode; line: string; children: ReactNode }) {
  return <section id={id} className="rs-sec st-sec" aria-labelledby={`h-${id}`}>
    <div className="rs-sec-head"><h2 id={`h-${id}`} className="pt-h2">{title}</h2><p className="mute">{line}</p></div>
    <div className="st-body">{children}</div>
  </section>;
}

export function PortalSettings({ slug, hint, rejected, isAdmin, usage, storage }: { slug: string; hint: string | null; rejected?: boolean; isAdmin: boolean; usage: { requests: number; input: number; output: number } | null; storage?: { title: ReactNode; body: ReactNode } | null }) {
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
  return <>
    <Sec id="team" title="Your team" line="Everyone signs in with their own email, so their questions and saved work stay their own.">
      <TeamManager slug={slug} />
    </Sec>
    {isAdmin ? <>
      <Sec id="ai" title="AI" line="Ask and the AI tools run on your own Anthropic account, so usage is billed to you and you set the limit.">
        {hint && rejected ? <p role="alert" className="st-alert">Anthropic rejected the key ending {hint}: it may have been revoked or deleted, so Ask and the AI tools aren’t working. Paste a new key below.</p> : null}
        <div className="st-row">
          <div className="st-rowtxt"><p>Anthropic API key</p><p className="mute">{hint ? `${rejected ? 'Saved' : 'Connected'} · key ending ${hint}` : 'Not connected yet'}</p></div>
          {hint ? <button className="btn" onClick={disconnect}>Disconnect</button> : null}
        </div>
        <div className="st-field"><label className="sr" htmlFor="k">Anthropic API key</label><input id="k" className="in" type="password" autoComplete="off" placeholder={hint ? 'Paste a new key to replace it' : 'sk-ant-…'} value={key} onChange={(e) => setKey(e.target.value)} /><button className="btn solid" disabled={key.trim().length < 20} onClick={save}>{hint ? 'Replace key' : 'Connect'}</button></div>
        {msg ? <p className="mute st-msg" role="status">{msg}</p> : null}
        {usage ? <div className="st-row">
          <div className="st-rowtxt"><p>Last 30 days · {usage.requests} AI request{usage.requests === 1 ? '' : 's'}</p><p className="mute">{(usage.input + usage.output).toLocaleString('en-GB')} tokens. Billing and spend limits are in your Anthropic account.</p></div>
          <a className="btn" href="https://platform.claude.com/settings/billing" target="_blank" rel="noopener">Billing ↗</a>
        </div> : null}
        <details className="st-help"><summary>How to get a key</summary><ol>
          <li>Sign in at platform.claude.com, add billing and set a monthly spend limit.</li>
          <li>Create an API key and choose one workspace for it.</li>
          <li>Paste it above. It’s checked, stored encrypted and never shown again.</li>
        </ol></details>
      </Sec>
      <Sec id="claude" title="Your own Claude" line="Add these guidelines to Claude as a custom connector, so it answers and designs on-brand wherever you use it.">
        <div className="st-row">
          <div className="st-rowtxt"><p>Connector link</p><p className="mute">{conn ? conn.note : 'Make a private link, then add it in Claude under Settings → Connectors.'}</p></div>
          <button className="btn" onClick={connector}>{conn ? 'Make a new link' : 'Create link'}</button>
        </div>
        {conn ? <input className="in st-copy" readOnly value={conn.url} onFocus={(e) => e.target.select()} aria-label="Connector URL" /> : null}
      </Sec>
      {storage ? <Sec id="storage" title={storage.title} line="Keep the brand kit in your own storage, and choose where Photographer and Director keep their full-size files.">{storage.body}</Sec> : null}
      <Sec id="requests" title="Requests to Lost Property" line="Ask for changes to the guidelines, new assets, hosting on your own domain, or anything else.">
        <Requests slug={slug} />
      </Sec>
    </> : storage ? <Sec id="storage" title={storage.title} line="Keep the brand kit in your own storage, and choose where Photographer and Director keep their full-size files.">{storage.body}</Sec> : null}
  </>;
}
