'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BETA_ACCESS, portalName, type BetaAccess } from '@/lib/portalVersion';

// A client's portal version: the main portal, and whether the beta is off, the studio's to try in Staging, or the
// client's. Only studio admins change it; switching back is instant.
export function PortalVersionSetting({ projectId, slug, client, main, beta, access, admin }: { projectId: string; slug: string; client: string; main: number; beta: number | null; access: BetaAccess; admin: boolean }) {
  const router = useRouter();
  const [now, setNow] = useState(access);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  async function set(a: BetaAccess) {
    if (a === now) return;
    if (a === 'client' && !confirm(`Give ${client}’s team ${beta ? portalName(beta) : 'the beta'}? They’ll see it the next time they open their portal.`)) return;
    setBusy(true); setMsg('');
    const r = await fetch(`/api/projects/${projectId}/portal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access: a }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error || 'Couldn’t save.'); return; }
    setNow(a); router.refresh();
  }
  const shown = beta ? now : 'off';
  return <div className="ss-rows">
    <div className="ss-row"><div><p className="ss-name">Main portal</p><p className="ss-about">What {client} sees unless they have the beta.</p></div><span className="ss-val">{portalName(main)}</span></div>
    <div className="ss-row ss-col">
      <div className="ss-row-r"><div><p className="ss-name">Beta {beta ? <span className="ss-pill">{portalName(beta)}</span> : null}</p>
        <p className="ss-about">{beta ? BETA_ACCESS.find((x) => x.id === shown)?.about : 'No beta in the works. A new one appears here once it’s in the code.'}</p></div>
      {beta ? <div className="seg ss-seg-r" role="radiogroup" aria-label="Beta access">
        {BETA_ACCESS.map((o) => <button key={o.id} type="button" role="radio" aria-checked={shown === o.id} className={'seg-o' + (shown === o.id ? ' on' : '')} disabled={!admin || busy} onClick={() => set(o.id)}>{o.label}</button>)}
      </div> : null}</div>
      {beta && !admin ? <p className="ss-about">Only studio admins change this.</p> : null}
      {beta && now !== 'off' ? <a className="btn" href={`/api/p/${slug}/staging?portal=beta`}>Open the beta in Staging</a> : null}
      {msg ? <p className="ss-about" role="alert">{msg}</p> : null}
    </div>
  </div>;
}
