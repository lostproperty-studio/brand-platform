'use client';
import { useEffect, useState } from 'react';
import { BETA_ACCESS, portalName, type BetaAccess } from '@/lib/portalVersion';

type Data = { main: number; beta: number | null; staging: boolean; portals: { n: number; name: string; about: string }[]; projects: { id: string; slug: string; client: string; access: BetaAccess }[] };

// Releases → Portal versions: the main portal every client gets, the beta in the works, and which clients have it.
// Making the beta main gives it to every client; the next version in the code then becomes the beta.
export function AdminPortal() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState(''), [busy, setBusy] = useState('');
  const load = () => fetch('/api/admin/portal').then((r) => r.json()).then(setD).catch(() => setErr('Couldn’t load the portal versions.'));
  useEffect(() => { load(); }, []);
  if (!d) return <div className="adm-card"><p className="mute">{err || 'Loading…'}</p></div>;
  const about = (n: number | null) => d.portals.find((p) => p.n === n)?.about || '';
  async function setMain(n: number, sure: string) {
    if (!confirm(sure)) return;
    setBusy('main'); setErr('');
    const r = await fetch('/api/admin/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ main: n }) });
    setBusy(''); if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || 'Couldn’t change it.'); return; }
    load();
  }
  async function setAccess(id: string, a: BetaAccess) {
    setBusy(id); setErr('');
    const r = await fetch(`/api/projects/${id}/portal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access: a }) });
    setBusy(''); if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || 'Couldn’t save.'); return; }
    setD({ ...d!, projects: d!.projects.map((p) => (p.id === id ? { ...p, access: a } : p)) });
  }
  const withBeta = d.projects.filter((p) => p.access === 'client').length;
  return <div className="adm-card pv">
    {d.staging ? <p className="mute">This is the staging site: it runs the newest portal everywhere.</p> : null}
    <div className="pv-line">
      <div className="pv-v"><p className="pv-k">Main</p><p className="pv-n">{portalName(d.main)}</p><p className="mute">{about(d.main)}</p><p className="mute">Every client, unless they have the beta.</p></div>
      <div className="pv-v beta"><p className="pv-k">Beta</p>{d.beta ? <><p className="pv-n">{portalName(d.beta)}</p><p className="mute">{about(d.beta)}</p><p className="mute">{withBeta ? `${withBeta} client${withBeta === 1 ? ' has' : 's have'} it.` : 'No client has it yet.'}</p></> : <p className="mute">Nothing in the works. A new beta appears here once it’s in the code.</p>}</div>
    </div>
    <div className="row">
      {d.beta ? <button type="button" className="btn pink" disabled={!!busy} onClick={() => setMain(d.beta!, `Make ${portalName(d.beta!)} the main portal? Every client gets it straight away.`)}>Make {portalName(d.beta)} the main portal</button> : null}
      {d.main > 1 ? <button type="button" className="btn" disabled={!!busy} onClick={() => setMain(d.main - 1, `Go back to ${portalName(d.main - 1)} as the main portal? Clients without the beta get it straight away.`)}>Go back to {portalName(d.main - 1)}</button> : null}
    </div>
    {d.beta ? <><p className="pv-k">Who has {portalName(d.beta)}</p>
      <ul className="pv-list">{d.projects.map((p) => <li key={p.id}><span>{p.client}</span>
        <div className="seg" role="radiogroup" aria-label={`Beta access for ${p.client}`}>{BETA_ACCESS.map((o) => <button key={o.id} type="button" role="radio" aria-checked={p.access === o.id} className={'seg-o' + (p.access === o.id ? ' on' : '')} disabled={busy === p.id} onClick={() => setAccess(p.id, o.id)}>{o.label}</button>)}</div>
      </li>)}</ul></> : null}
    {err ? <p className="cd-err" role="alert">{err}</p> : null}
  </div>;
}
