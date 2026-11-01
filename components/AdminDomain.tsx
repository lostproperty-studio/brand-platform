'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, Globe, Loader2, RefreshCw } from 'lucide-react';

type Check = { host: string; saved: boolean; live: boolean; dns: boolean; records: string[]; serving: boolean; appUrlSet: boolean; vercelApi: boolean; error?: string };
const I = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;

// Putting the platform on the studio's own domain, step by step, with a live check of each step
export function AdminDomain({ appHost }: { appHost: string }) {
  const [c, setC] = useState<Check | null>(null);
  const [host, setHost] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = async () => { setBusy(true); const r = await fetch('/api/admin/domain'); const j = await r.json().catch(() => null); setBusy(false); if (j) { setC(j); setHost((h) => h || j.host); } };
  useEffect(() => { load(); }, []);
  async function save(addToVercel = false) {
    setBusy(true); setErr('');
    const r = await fetch('/api/admin/domain', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host, addToVercel }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error || 'Couldn’t save.'); return; }
    setC(j);
  }
  const Step = ({ ok, title, children }: { ok?: boolean; title: string; children: React.ReactNode }) => <li className={'adm-step' + (ok ? ' ok' : '')}>{ok ? <CheckCircle2 size={18} strokeWidth={1.75} aria-label="Done" /> : <Circle size={18} strokeWidth={1.75} aria-label="To do" />}<div><p>{title}</p><div className="mute">{children}</div></div></li>;
  const h = host || 'platform.lostproperty.studio';
  return (
    <div className="adm-domain">
      <div className="adm-live">
        <span className="ov-ic"><Globe {...I} /></span>
        <div><p className="adm-big">{c?.live ? h : appHost}</p><p className="mute">{c?.live ? `Live. Portals are at ${h}/<project>, for example ${h}/tileyard.` : `Portals are at ${appHost}/<project> for now. They move to ${h} once the steps below are done.`}</p></div>
        <button className="btn ic" onClick={load} disabled={busy}>{busy ? <Loader2 size={15} className="spin" aria-hidden /> : <RefreshCw size={15} strokeWidth={1.75} aria-hidden />}Check again</button>
      </div>
      <div className="pa-row"><span className="pa-host">Domain</span><input className="in pa-in" value={host} onChange={(e) => setHost(e.target.value.trim().toLowerCase())} placeholder="platform.lostproperty.studio" aria-label="Domain" spellCheck={false} /><button className="btn solid" disabled={busy || !host} onClick={() => save(false)}>Save</button></div>
      {err ? <p className="adm-msg" role="alert">{err}</p> : null}
      <ol className="adm-steps">
        <Step ok={c?.saved} title="Choose the domain">Save it above. Each project then gets its own address on it, like {h}/tileyard.</Step>
        <Step ok={c?.serving} title="Add it to the platform on Vercel">
          {c?.vercelApi ? <button className="btn" disabled={busy} onClick={() => save(true)}>Add {h} to Vercel</button>
            : <>In Vercel, open the brand-platform project, go to Settings → Domains and add <code>{h}</code>. <a href="https://vercel.com/dashboard" target="_blank" rel="noopener">Open Vercel <ExternalLink size={12} aria-hidden /></a></>}
        </Step>
        <Step ok={c?.dns} title="Point the domain at Vercel">Where lostproperty.studio’s DNS is managed, add a CNAME record: name <code>{h.split('.')[0]}</code>, value <code>cname.vercel-dns.com</code>.{c?.records.length ? <> Currently: {c.records.join(', ')}.</> : <> No record found yet; changes can take up to an hour.</>}</Step>
        <Step ok={c?.appUrlSet} title="Make it the platform’s main address">In Vercel → Settings → Environment Variables, set <code>NEXT_PUBLIC_APP_URL</code> to <code>https://{h}</code> and redeploy. Sign-in emails and shared links then use it.</Step>
        <Step ok={c?.appUrlSet && c?.serving} title="Allow sign-in on it">In Supabase → Authentication → URL Configuration, set the Site URL to <code>https://{h}</code> and add <code>https://{h}/**</code> to the redirect URLs, so sign-in links work there.</Step>
      </ol>
    </div>
  );
}
