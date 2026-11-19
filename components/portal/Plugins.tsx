'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Loader2, RotateCw, X } from 'lucide-react';
import { LpPanel } from '@/components/panel/LpPanel';
import type { PanelBrand, PanelHostApi } from '@/components/panel/types';
import { PANEL_PARTS, type PanelSettings, type PluginDef, type PluginId } from '@/lib/plugins/catalog';

// Resources → Plug-ins: the brand inside the apps the team already uses, and their files where they keep them.
// Everyone sees what's connected; only the portal's lead (or the studio) connects, changes settings or syncs.

export type PluginView = {
  def: PluginDef;
  /** What the platform is set up for: the panel, the account (the developer app registered with the app's maker) */
  ready: { panel: boolean; account: boolean };
  connected: { account: string | null; settings: Record<string, boolean | string>; last?: { at: string; sent: number; removed: number; kept: number; error?: string } } | null;
  /** Whether the panel has sign-in credentials for this app */
  panelSet: boolean;
  /** Canva, for the studio: whether this client signs in through their own Canva integration, and its redirect URL */
  canva?: { ownApp: boolean; callback: string };
};

const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export function Plugins({ slug, client, lead, staff, items, panel, preview, dbReady, flash }: { slug: string; client: string; lead: boolean; staff: boolean; items: PluginView[]; panel: PanelSettings; preview: PanelBrand | null; dbReady: boolean; flash?: { plugin: string; msg: string } }) {
  const [open, setOpen] = useState<PluginId | null>(null);
  const [msg, setMsg] = useState(flash?.msg || '');
  useEffect(() => { if (flash) { const u = new URL(window.location.href); u.searchParams.delete('plugin'); u.searchParams.delete('msg'); window.history.replaceState(null, '', u.toString()); } }, [flash]);
  const apps = items.filter((i) => i.def.group === 'apps'), storage = items.filter((i) => i.def.group === 'storage');
  const cur = items.find((i) => i.def.id === open);
  return <>
    {msg ? <p className="plg-flash" role="status">{msg}<button type="button" onClick={() => setMsg('')} aria-label="Dismiss"><X {...I} /></button></p> : null}
    {!dbReady && staff ? <p className="plg-flash warn">Plug-ins aren’t set up in this database yet (migration 0013). Everything below is a preview.</p> : null}

    <div className="plg-split">
      <div>
        <h3 className="plg-h">In your apps</h3>
        <div className="plg-cards">{apps.map((p) => <Card key={p.def.id} p={p} onOpen={() => setOpen(p.def.id)} />)}</div>
        {storage.length ? <>
          <h3 className="plg-h">File storage</h3>
          <p className="mute plg-hint">Keep the brand kit in the storage your team already uses. Choose one to hold the full-size Photographer images and Director videos; the platform keeps small previews so the apps stay quick.</p>
          <div className="plg-cards">{storage.map((p) => <Card key={p.def.id} p={p} onOpen={() => setOpen(p.def.id)} />)}</div>
        </> : null}
      </div>
      <PanelPreview slug={slug} client={client} lead={lead} panel={panel} preview={preview} />
    </div>

    {cur ? <Drawer p={cur} slug={slug} client={client} lead={lead} staff={staff} onClose={() => setOpen(null)} onMsg={setMsg} /> : null}
  </>;
}

function Card({ p, onOpen }: { p: PluginView; onOpen: () => void }) {
  const soon = (!p.def.panel || p.def.panel.status === 'soon') && (!p.def.account || p.def.account.status === 'soon');
  const state = soon ? 'Coming soon' : p.connected ? 'Connected' : p.panelSet ? 'Panel set up' : 'Not connected';
  return <button type="button" className={'plg-card' + (soon ? ' soon' : '')} onClick={onOpen}>
    <span className="plg-card-top"><span className="plg-name">{p.def.name}</span><span className={'plg-state' + (p.connected || p.panelSet ? ' on' : '')}>{state}</span></span>
    <span className="mute plg-line">{p.def.line}</span>
    {soon ? <span className="tag">Studio only: clients don’t see this yet</span> : null}
  </button>;
}

function Drawer({ p, slug, client, lead, staff, onClose, onMsg }: { p: PluginView; slug: string; client: string; lead: boolean; staff: boolean; onClose: () => void; onMsg: (m: string) => void }) {
  const router = useRouter();
  const d = p.def;
  const [busy, setBusy] = useState(''), [err, setErr] = useState('');
  const [set, setSet] = useState<Record<string, boolean | string>>(p.connected?.settings || Object.fromEntries(d.settings.map((s) => [s.id, s.default])));
  const [creds, setCreds] = useState<{ clientId: string; secret: string; authorizeUrl: string; tokenUrl: string } | null>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  async function save(id: string, v: boolean | string) {
    setSet((s) => ({ ...s, [id]: v })); setErr('');
    const r = await fetch(`/api/p/${slug}/plugins`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plugin: d.id, settings: { [id]: v } }) });
    if (!r.ok) setErr(await r.text()); else router.refresh();
  }
  async function sync() {
    setBusy('sync'); setErr('');
    const r = await fetch(`/api/p/${slug}/plugins/${d.id}/sync`, { method: 'POST' });
    setBusy('');
    if (!r.ok) { setErr(await r.text()); return; }
    const j = await r.json(); onMsg(j.error ? `Synced, with a problem: ${j.error}` : `${d.name} is up to date: ${j.sent} sent, ${j.kept} already there${j.removed ? `, ${j.removed} removed` : ''}.`); router.refresh();
  }
  async function disconnect() {
    if (!confirm(`Disconnect ${d.name}? What’s already in ${d.name} stays there; the platform just stops updating it.`)) return;
    setBusy('off'); await fetch(`/api/p/${slug}/plugins/${d.id}/sync`, { method: 'DELETE' }); setBusy(''); onMsg(`${d.name} is disconnected.`); router.refresh(); onClose();
  }
  async function makeCreds() {
    if (p.panelSet && !confirm('Make new sign-in details for the panel? The old ones stop working, so everyone signs in again once the app has the new ones.')) return;
    setBusy('creds'); setErr('');
    const r = await fetch(`/api/p/${slug}/plugins/panel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: d.panel!.host }) });
    setBusy('');
    if (!r.ok) { setErr(await r.text()); return; }
    setCreds(await r.json()); router.refresh();
  }

  const settings = d.settings.filter((s) => staff || !s.studioOnly);
  return <div className="plg-scrim" onClick={onClose}>
    <aside className="plg-drawer" role="dialog" aria-modal="true" aria-label={d.name} onClick={(e) => e.stopPropagation()}>
      <header className="plg-dhead"><div><p className="plg-dname">{d.name}</p><p className="mute">{d.line}</p></div><button type="button" className="plg-x" onClick={onClose} aria-label="Close"><X {...I} /></button></header>

      {d.panel ? <section className="plg-block">
        <div className="plg-bhead"><h4>The brand panel</h4>{d.panel.status === 'soon' ? <span className="tag">Coming soon</span> : p.panelSet ? <span className="plg-state on">Set up</span> : null}</div>
        <p className="mute">{d.panel.where}. The same panel as in your other apps, signed in to this portal only.</p>
        <p className="plg-needs">{d.panel.needs}</p>
        {d.panel.status === 'ready' && d.panel.host === 'canva' ? <ol className="plg-steps">
          <li>Lost Property adds the app to your Canva team. Canva builds private apps inside the team that uses them, so we’ll ask to be invited as a member, or your developer can do this step with our app.</li>
          <li>The app signs in with the details below, so it only ever shows {client}’s brand, and only to people in this portal.</li>
          <li>Your Canva admin approves it under <strong>Settings → Team apps</strong>. Canva releases it to your team straight away.</li>
          <li>In a design, open <strong>Apps</strong>, choose the panel and sign in with your portal email.</li>
        </ol> : null}
        {d.panel.status === 'ready' && lead ? <div className="plg-row">
          <button type="button" className="btn" onClick={makeCreds} disabled={!!busy}>{busy === 'creds' ? <Loader2 {...I} className="spin" /> : null}{p.panelSet ? 'Make new sign-in details' : 'Make sign-in details'}</button>
        </div> : null}
        {creds ? <div className="plg-creds">
          <p className="mute">Shown once: copy them into the app’s settings in Canva (Developer Portal → your app → Authentication) now.</p>
          {([['Client ID', creds.clientId], ['Client secret', creds.secret], ['Authorisation URL', creds.authorizeUrl], ['Token URL', creds.tokenUrl], ['Scope', 'brand']] as const).map(([k, v]) => <CopyRow key={k} k={k} v={v} />)}
        </div> : null}
      </section> : null}

      {d.account ? <section className="plg-block">
        <div className="plg-bhead"><h4>{d.account.action}</h4>{d.account.status === 'soon' ? <span className="tag">Coming soon</span> : p.connected ? <span className="plg-state on">Connected{p.connected.account ? ` as ${p.connected.account}` : ''}</span> : null}</div>
        <p className="mute">{d.account.about}</p>
        {d.account.status === 'ready' ? (p.connected ? <>
          <p className={'plg-last' + (p.connected.last?.error ? ' bad' : '')}>{p.connected.last ? (p.connected.last.error ? `Last sync ${when(p.connected.last.at)}: ${p.connected.last.error}` : `Last sync ${when(p.connected.last.at)}: ${p.connected.last.sent + p.connected.last.kept} files in your ${d.name} folder.`) : 'Not synced yet.'}</p>
          {lead ? <div className="plg-row"><button type="button" className="btn solid" onClick={sync} disabled={!!busy}>{busy === 'sync' ? <Loader2 {...I} className="spin" /> : <RotateCw {...I} />}Sync now</button><button type="button" className="btn" onClick={disconnect} disabled={!!busy}>Disconnect</button></div> : null}
        </> : lead ? (p.ready.account ? <div className="plg-row"><a className="btn solid" href={`/api/p/${slug}/plugins/${d.id}/connect`}>{d.account.action}</a></div> : <p className="plg-needs">{staff ? `Needs a ${d.name} integration: Lost Property’s (CANVA_CLIENT_ID and CANVA_CLIENT_SECRET on the platform) or the client’s own, entered below.` : `Lost Property is finishing setting this up.`}</p>)
          : <p className="plg-needs">Your portal’s lead can connect this.</p>) : null}
      </section> : null}

      {p.canva && staff ? <CanvaApp slug={slug} c={p.canva} onDone={(m) => { onMsg(m); router.refresh(); }} /> : null}

      {settings.length && (p.connected || d.group === 'apps') ? <section className="plg-block">
        <h4>Settings</h4>
        <div className="plg-settings">{settings.map((s) => <label key={s.id} className={'plg-set' + (s.type === 'text' ? ' text' : '')}>
          {s.type === 'toggle' ? <input type="checkbox" checked={!!set[s.id]} disabled={!lead} onChange={(e) => save(s.id, e.target.checked)} /> : null}
          <span><span>{s.label}{s.tag ? <span className="tag">{s.tag}</span> : null}{s.studioOnly ? <span className="tag">Studio only</span> : null}</span>{s.about ? <span className="mute">{s.about}</span> : null}</span>
          {s.type === 'text' ? <input className="in" defaultValue={String(set[s.id] || '')} disabled={!lead} placeholder="Brand platform" onBlur={(e) => e.target.value !== set[s.id] && save(s.id, e.target.value)} /> : null}
        </label>)}</div>
      </section> : null}

      <section className={'plg-block plg-cando' + (d.cant.length ? '' : ' one')}>
        <div><h4>What it does</h4><ul>{d.can.map((c) => <li key={c}><Check {...I} />{c}</li>)}</ul></div>
        {d.cant.length ? <div><h4>What {d.name} doesn’t allow</h4><ul className="no">{d.cant.map((c) => <li key={c}><X {...I} />{c}</li>)}</ul></div> : null}
      </section>
      {err ? <p className="plg-last bad" role="alert">{err}</p> : null}
    </aside>
  </div>;
}

/** Studio only: which Canva integration this client signs in through. Lost Property's has to be public (reviewed by
 *  Canva) to work for other teams; a private one made inside the client's own Canva team needs no review. */
function CanvaApp({ slug, c, onDone }: { slug: string; c: { ownApp: boolean; callback: string }; onDone: (m: string) => void }) {
  const [id, setId] = useState(''), [secret, setSecret] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  async function save(clear = false) {
    setBusy(true); setErr('');
    const r = await fetch(`/api/p/${slug}/plugins/canva/sync`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clear ? {} : { clientId: id, secret }) });
    setBusy(false);
    if (!r.ok) { setErr(await r.text()); return; }
    setId(''); setSecret(''); onDone(clear ? 'Canva now signs in through Lost Property’s integration. Connect again.' : 'Saved. Connect Canva again to sign in through the client’s integration.');
  }
  return <section className="plg-block">
    <div className="plg-bhead"><h4>Canva integration</h4><span className="tag">Studio only</span></div>
    <p className="mute">{c.ownApp ? 'This client signs in through an integration made in their own Canva team.' : 'This client signs in through Lost Property’s integration. For clients outside our Canva team it has to be a public integration that Canva has reviewed.'} Or make a private integration in the client’s Canva team (Developer Portal → Your integrations), with scopes asset:read, asset:write, folder:read, folder:write and profile:read, and enter it here.</p>
    <CopyRow k="Redirect URL" v={c.callback} />
    <div className="plg-row"><input className="in" placeholder="Client ID" value={id} onChange={(e) => setId(e.target.value)} /><input className="in" placeholder="Client secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} /></div>
    <div className="plg-row"><button type="button" className="btn" disabled={busy || !id || !secret} onClick={() => save()}>Use the client’s integration</button>{c.ownApp ? <button type="button" className="btn" disabled={busy} onClick={() => save(true)}>Use Lost Property’s</button> : null}</div>
    {err ? <p className="plg-last bad">{err}</p> : null}
  </section>;
}

function CopyRow({ k, v }: { k: string; v: string }) {
  const [ok, setOk] = useState(false);
  return <div className="plg-copy"><span className="mute">{k}</span><code>{v}</code><button type="button" className="plg-x" aria-label={`Copy ${k}`} onClick={async () => { await navigator.clipboard.writeText(v); setOk(true); setTimeout(() => setOk(false), 1500); }}>{ok ? <Check {...I} /> : <Copy {...I} />}</button></div>;
}

/** The panel as it looks in every app, live, with this client's brand; and (for the lead) what it shows */
function PanelPreview({ slug, client, lead, panel, preview }: { slug: string; client: string; lead: boolean; panel: PanelSettings; preview: PanelBrand | null }) {
  const router = useRouter();
  const [show, setShow] = useState(panel);
  const [note, setNote] = useState('');
  async function toggle(id: keyof PanelSettings, v: boolean) {
    setShow((s) => ({ ...s, [id]: v }));
    await fetch(`/api/p/${slug}/plugins`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ panel: { [id]: v } }) });
    router.refresh();
  }
  const host: PanelHostApi = {
    name: 'Preview',
    insertImage: async (img) => { setNote(`In an app, this places ${img.name} in the design.`); },
    insertText: async () => { setNote('In an app, this adds the line to the page.'); },
    copy: async (t) => { await navigator.clipboard.writeText(t); },
    ask: async (q, history) => {
      const r = await fetch(`/api/p/${slug}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [...history, { role: 'user', content: q }] }) });
      if (!r.ok) throw new Error(await r.text());
      return (await r.text()).trim();
    },
    openPortal: () => window.open(`/p/${slug}`, '_blank')
  };
  return <div className="plg-preview">
    <h3 className="plg-h">The panel</h3>
    <div className="plg-frame">{preview ? <LpPanel brand={{ ...preview, show }} host={host} /> : <p className="mute plg-empty">The panel shows {client}’s brand once the guidelines are published.</p>}</div>
    {note ? <p className="mute plg-note">{note}</p> : <p className="mute plg-note">The same panel in Canva, Office and Google, with {client}’s brand. Try it here.</p>}
    {lead ? <div className="plg-parts"><p className="mute">What it shows</p>{PANEL_PARTS.map(({ id, label }) => <label key={id} className="plg-part"><input type="checkbox" checked={show[id]} onChange={(e) => toggle(id, e.target.checked)} />{label}</label>)}</div> : null}
  </div>;
}
