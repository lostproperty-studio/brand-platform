'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Copy, Download, Loader2, RotateCw, X } from 'lucide-react';
import { LpPanel } from '@/components/panel/LpPanel';
import { LpAppIcon } from '@/components/panel/LpAppIcon';
import type { PanelBrand, PanelHostApi } from '@/components/panel/types';
import { PANEL_PARTS, type PanelSettings, type PluginDef, type PluginId } from '@/lib/plugins/catalog';

// Resources → Plug-ins: the brand inside the apps the team already uses, and their files where they keep them.
// A grid of apps; each opens a small window that leads with what it does, with the how-to folded away.
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
  /** Google: the add-on's Marketplace listing, once published */
  marketplace?: string | null;
};

const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;
const ago = (iso?: string) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const isSoon = (d: PluginDef) => (!d.panel || d.panel.status === 'soon') && (!d.account || d.account.status === 'soon');
type State = 'on' | 'add' | 'soon';
const stateOf = (p: PluginView): State => (isSoon(p.def) ? 'soon' : p.connected || p.panelSet ? 'on' : 'add');
const STATE_LABEL: Record<State, string> = { on: 'Connected', add: 'Add', soon: 'Soon' };

const MONO: Partial<Record<PluginId, string>> = { office: 'M', google: 'G', gdrive: 'D', sharepoint: 'S' };
/** Official app icons in public/plugins (from each maker's brand kit). A square app icon (.png) fills the mark;
 *  a bare logo (.svg) sits inside it. Add an app here when its file goes in; the rest show a monogram. */
const ICONS: Partial<Record<PluginId, 'png' | 'svg'>> = { canva: 'png', figma: 'png', office: 'png', google: 'png', gdrive: 'png', dropbox: 'png', sharepoint: 'png', github: 'png' };

/** The app's mark: its official icon, or a quiet monogram until there is one */
export function AppMark({ id, name, size = 44 }: { id: PluginId | 'lp'; name: string; size?: number }) {
  if (id === 'lp') return <LpAppIcon size={size} className="plg-lpicon" />;
  const icon = ICONS[id];
  return <span className={'plg-mark' + (icon === 'png' ? ' full' : '')} style={{ width: size, height: size }} aria-hidden>
    {icon
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={`/plugins/${id}.${icon}`} alt="" />
      : <span className="plg-mono" style={{ fontSize: size * 0.42 }}>{MONO[id] || name.slice(0, 1)}</span>}
  </span>;
}

export function Plugins({ group, slug, client, lead, staff, items, panel, preview, dbReady, flash }: { group: 'apps' | 'storage'; slug: string; client: string; lead: boolean; staff: boolean; items: PluginView[]; panel: PanelSettings; preview: PanelBrand | null; dbReady: boolean; flash?: { plugin: string; msg: string } }) {
  const [open, setOpen] = useState<PluginId | null>(flash && items.some((i) => i.def.id === flash.plugin) ? flash.plugin as PluginId : null);
  const [msg, setMsg] = useState(flash?.msg || '');
  useEffect(() => { if (flash) { const u = new URL(window.location.href); u.searchParams.delete('plugin'); u.searchParams.delete('msg'); window.history.replaceState(null, '', u.toString()); } }, [flash]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(''), 6000); return () => clearTimeout(t); }, [msg]);
  const cur = items.find((i) => i.def.id === open);
  const [sheet, setSheet] = useState(false);
  return <>
    {!dbReady && staff ? <p className="plg-flash warn">Preview: plug-ins aren’t set up in this database yet (migration 0013).</p> : null}
    {group === 'apps' ? <button type="button" className="plg-bar" onClick={() => setSheet(true)}>
      <AppMark id="lp" name="Lost Property" size={52} />
      <span className="plg-bartxt"><span className="plg-barname">Brand Panel</span><span className="mute">Bring the platform with you in the workspaces your organisation uses day to day.</span></span>
      <span className="btn">Preview</span>
    </button> : null}
    <div className="plg-tiles">{items.map((p) => {
      const st = stateOf(p);
      return <button key={p.def.id} type="button" className={'plg-tile ' + st} onClick={() => setOpen(p.def.id)}>
        <AppMark id={p.def.id} name={p.def.name} />
        <span className="plg-tname">{p.def.name}</span>
        <span className={'plg-pill ' + st}>{st === 'on' ? <span className="plg-live" aria-hidden /> : null}{STATE_LABEL[st]}</span>
      </button>;
    })}</div>
    {cur ? <Connect p={cur} slug={slug} client={client} lead={lead} staff={staff} onClose={() => setOpen(null)} onMsg={setMsg} onPreview={d => { setOpen(null); setSheet(true); void d; }} /> : null}
    {sheet ? <PanelSheet slug={slug} client={client} lead={lead} panel={panel} preview={preview} onClose={() => setSheet(false)} /> : null}
    <div className={'plg-toast' + (msg ? ' show' : '')} role="status" aria-live="polite">{msg}</div>
  </>;
}

/** LP and the app, joined by a line that comes alive once they're connected */
function Wire({ id, name, live }: { id: PluginId; name: string; live: boolean }) {
  const [still, setStill] = useState(false);
  useEffect(() => { setStill(window.matchMedia('(prefers-reduced-motion: reduce)').matches); }, []);
  return <div className={'plg-link' + (live ? ' live' : '')}>
    <AppMark id="lp" name="Lost Property" size={56} />
    <svg viewBox="0 0 120 20" className="plg-wire" aria-hidden>
      <path id={`w-${id}`} d="M2 10 H118" />
      {live && !still ? <><circle r="3"><animateMotion dur="1.8s" repeatCount="indefinite"><mpath href={`#w-${id}`} /></animateMotion></circle>
        <circle r="3" opacity=".5"><animateMotion dur="1.8s" begin=".9s" repeatCount="indefinite"><mpath href={`#w-${id}`} /></animateMotion></circle></> : live ? <circle cx="60" cy="10" r="3" /> : null}
    </svg>
    <AppMark id={id} name={name} size={56} />
  </div>;
}

function Fold({ title, children, tag }: { title: string; children: ReactNode; tag?: string }) {
  return <details className="plg-fold"><summary>{title}{tag ? <span className="tag">{tag}</span> : null}<ChevronDown {...I} /></summary><div className="plg-fold-in">{children}</div></details>;
}

/** One thing the plug-in does, as a row: what it is, where it stands, and the one action that moves it on */
function Row({ title, sub, state, children }: { title: string; sub?: ReactNode; state?: { label: string; on?: boolean }; children?: ReactNode }) {
  return <div className="plg-row2">
    <div className="plg-rowtxt"><p>{title}</p>{sub ? <p className="mute">{sub}</p> : null}</div>
    <div className="plg-rowact">{state ? <span className={'plg-pill' + (state.on ? ' on' : ' soon')}>{state.on ? <Check size={11} strokeWidth={2.5} aria-hidden /> : null}{state.label}</span> : null}{children}</div>
  </div>;
}

function Connect({ p, slug, client, lead, staff, onClose, onMsg, onPreview }: { p: PluginView; slug: string; client: string; lead: boolean; staff: boolean; onClose: () => void; onMsg: (m: string) => void; onPreview: (id: PluginId) => void }) {
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
    const j = await r.json(); onMsg(j.error ? `Synced, with a problem: ${j.error}` : `Up to date · ${j.sent} new, ${j.kept} already there`); router.refresh();
  }
  async function disconnect() {
    if (!confirm(`Disconnect ${d.name}? What’s already there stays; the platform just stops updating it.`)) return;
    setBusy('off'); await fetch(`/api/p/${slug}/plugins/${d.id}/sync`, { method: 'DELETE' }); setBusy(''); onMsg(`${d.name} disconnected`); router.refresh(); onClose();
  }
  async function makeCreds() {
    if (p.panelSet && !confirm('Make new sign-in details? The old ones stop working until the app has the new ones.')) return;
    setBusy('creds'); setErr('');
    const r = await fetch(`/api/p/${slug}/plugins/panel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: d.panel!.host }) });
    setBusy('');
    if (!r.ok) { setErr(await r.text()); return; }
    setCreds(await r.json()); router.refresh();
  }

  const soon = isSoon(d);
  const live = !soon && (!!p.connected || p.panelSet);
  const settings = d.settings.filter((s) => staff || (!s.studioOnly && !s.soon));
  const showSettings = settings.length > 0 && (!!p.connected || d.group === 'apps') && !soon;
  const host = d.panel?.host;
  const spin = (k: string) => (busy === k ? <Loader2 {...I} className="spin" /> : null);

  return <div className="plg-scrim" onClick={onClose}>
    <div className="plg-modal" role="dialog" aria-modal="true" aria-label={`LP Platform in ${d.name}`} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="plg-x plg-close" onClick={onClose} aria-label="Close"><X {...I} /></button>
      <Wire id={d.id} name={d.name} live={live} />
      <h3 className="plg-title">LP Platform in {d.name}</h3>
      <p className="mute plg-sub">{d.line}</p>
      {d.panel ? <button type="button" className="plg-peek" onClick={() => onPreview(d.id)}>Preview the Brand Panel</button> : null}

      <div className="plg-rows">
        {/* The brand panel, in each app */}
        {d.panel ? (d.panel.status === 'soon' ? <Row title="Brand panel" state={{ label: 'Soon' }} />
          : host === 'canva' ? <Row title="Brand panel" sub={p.panelSet ? undefined : 'Needs Canva Enterprise'} state={p.panelSet ? { label: 'Ready', on: true } : undefined}>
            {lead ? <button type="button" className={'btn' + (p.panelSet ? '' : ' solid')} onClick={makeCreds} disabled={!!busy}>{spin('creds')}{p.panelSet ? 'New sign-in details' : 'Set up'}</button> : null}
          </Row>
          : host === 'office' ? <>
            <Row title="Word, PowerPoint, Excel">{lead ? <a className="btn solid" href={`/api/p/${slug}/plugins/office/manifest?kind=documents`} download><Download {...I} />Add-in</a> : null}</Row>
            <Row title="Outlook">{lead ? <a className="btn" href={`/api/p/${slug}/plugins/office/manifest?kind=mail`} download><Download {...I} />Add-in</a> : null}</Row>
          </>
          : host === 'figma' ? <Row title="Figma and FigJam" sub="For everyone on the team">
            <a className="btn solid" href={`/api/p/${slug}/plugins/figma/plugin`} download><Download {...I} />Plugin</a>
          </Row>
          : host === 'google' ? <Row title="Docs, Slides, Sheets" sub={p.marketplace ? undefined : 'Not listed yet'}>
            {p.marketplace ? <a className="btn solid" href={p.marketplace} target="_blank" rel="noopener">Install</a> : null}
          </Row> : null) : null}

        {creds ? <div className="plg-creds">
          <p className="mute">Copy these into the app in Canva now. The secret won’t be shown again.</p>
          {([['Client ID', creds.clientId], ['Client secret', creds.secret], ['Authorisation URL', creds.authorizeUrl], ['Token URL', creds.tokenUrl], ['Scope', 'brand']] as const).map(([k, v]) => <CopyRow key={k} k={k} v={v} />)}
        </div> : null}

        {/* Sending things in: a folder in their Canva, a storage account */}
        {d.account ? (d.account.status === 'soon' ? <Row title={d.group === 'storage' ? 'Sync' : d.account.action} state={{ label: 'Soon' }} />
          : p.connected ? <Row title={d.group === 'storage' ? 'Sync' : 'Brand folder'} sub={<>{p.connected.account ? `${p.connected.account} · ` : ''}{p.connected.last ? (p.connected.last.error ? <span className="plg-bad">{p.connected.last.error}</span> : `${p.connected.last.sent + p.connected.last.kept} files · synced ${ago(p.connected.last.at)}`) : 'Not synced yet'}</>} state={{ label: 'Connected', on: true }}>
            {lead ? <button type="button" className="btn plg-icon" onClick={sync} disabled={!!busy} aria-label="Sync now" title="Sync now">{busy === 'sync' ? <Loader2 {...I} className="spin" /> : <RotateCw {...I} />}</button> : null}
          </Row>
          : <Row title={d.group === 'storage' ? 'Sync' : 'Brand folder'} sub={!p.ready.account ? 'Almost ready' : undefined}>
            {lead && p.ready.account ? <a className="btn solid" href={`/api/p/${slug}/plugins/${d.id}/connect`}>Connect</a> : null}
          </Row>) : null}
      </div>

      {!lead && !soon ? <p className="mute plg-lead">Your portal’s lead connects this.</p> : null}

      {showSettings ? <div className="plg-sets">{settings.map((s) => s.type === 'toggle'
        ? <label key={s.id} className={'plg-set' + (s.soon ? ' off' : '')} title={s.about}>
          <span>{s.label}{s.soon ? <span className="tag">Soon</span> : s.tag ? <span className="tag">{s.tag}</span> : null}</span>
          <input type="checkbox" role="switch" className="plg-switch" checked={!!set[s.id] && !s.soon} disabled={!lead || s.soon} onChange={(e) => save(s.id, e.target.checked)} />
        </label>
        : <label key={s.id} className="plg-set" title={s.about}><span>{s.label}</span><input className="in plg-in" defaultValue={String(set[s.id] || '')} disabled={!lead} placeholder="Brand platform" onBlur={(e) => e.target.value !== set[s.id] && save(s.id, e.target.value)} /></label>)}
      </div> : null}

      {err ? <p className="plg-bad plg-err" role="alert">{err}</p> : null}

      <div className="plg-folds">
        {!soon && d.panel?.status === 'ready' ? <Fold title="How to set it up"><Setup host={d.panel.host} client={client} needs={d.panel.needs} /></Fold> : null}
        <Fold title="What it can and can’t do">
          <ul className="plg-list">{d.can.map((c) => <li key={c}><Check {...I} />{c}</li>)}{d.cant.map((c) => <li key={c} className="no"><X {...I} />{c}</li>)}</ul>
          {d.panel?.status === 'soon' ? <p className="mute plg-note2">{d.panel.needs}</p> : null}
          {d.account?.about ? <p className="mute plg-note2">{d.account.about}</p> : null}
        </Fold>
        {p.connected && lead ? <Fold title="Disconnect"><p className="mute plg-note2">What’s already in {d.name} stays there. The platform just stops updating it.</p><button type="button" className="btn" onClick={disconnect} disabled={!!busy}>{spin('off')}Disconnect {d.name}</button></Fold> : null}
        {p.canva && staff ? <Fold title="Canva integration" tag="Studio"><CanvaApp slug={slug} c={p.canva} onDone={(m) => { onMsg(m); router.refresh(); }} /></Fold> : null}
        {staff && host === 'google' && !p.marketplace ? <Fold title="Publishing the add-on" tag="Studio"><p className="mute plg-note2">Set GOOGLE_ADDON_URL once the add-on is listed in the Google Workspace Marketplace. Steps are in plugins/google/README.md.</p></Fold> : null}
      </div>
    </div>
  </div>;
}

/** The step-by-step, folded away under "How to set it up" */
function Setup({ host, client, needs }: { host: string; client: string; needs: string }) {
  const steps = host === 'canva' ? [
    <>Lost Property adds the app to your Canva team: we’ll ask to be invited, or your developer adds it with our app.</>,
    <>Press <strong>Set up</strong> above and paste the sign-in details into the app. It will only ever show {client}’s brand.</>,
    <>Your Canva admin approves it in <strong>Settings → Team apps</strong>.</>,
    <>In any design, open <strong>Apps</strong> and sign in with your portal email.</>
  ] : host === 'office' ? [
    <>Download both add-ins above.</>,
    <>Your Microsoft 365 admin uploads them in <strong>Admin centre → Settings → Integrated apps → Upload custom apps</strong>.</>,
    <>A <strong>Brand</strong> button appears on the Home tab, and in Outlook when writing. It can take a few hours.</>,
    <>Press it and sign in with your portal email.</>
  ] : host === 'figma' ? [
    <>Download the plugin above and unzip it somewhere you’ll keep it.</>,
    <>In the Figma desktop app, open any file and go to <strong>Menu → Plugins → Development → Import plugin from manifest…</strong>, then choose <strong>manifest.json</strong>.</>,
    <>Run it from <strong>Plugins → Development → Brand panel by Lost Property</strong>, and sign in with your portal email.</>
  ] : [
    <>Your Google Workspace admin installs the add-on for your organisation from the Marketplace link.</>,
    <>In a doc, deck or sheet: <strong>Extensions → Brand panel by Lost Property</strong>.</>,
    <>Sign in with your portal email and check the short code.</>
  ];
  return <><ol className="plg-steps">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>{host === 'office' ? null : <p className="mute plg-note2">{needs}</p>}</>;
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
    setId(''); setSecret(''); onDone(clear ? 'Using Lost Property’s Canva integration' : 'Saved: connect Canva again');
  }
  return <div className="plg-studio">
    <p className="mute plg-note2">{c.ownApp ? 'Signs in through an integration in the client’s own Canva team.' : 'Signs in through Lost Property’s integration (it must be public, reviewed by Canva, for other teams).'} Or enter a private integration from the client’s team, with scopes asset:read, asset:write, folder:read, folder:write and profile:read.</p>
    <CopyRow k="Redirect URL" v={c.callback} />
    <div className="plg-inrow"><input className="in" placeholder="Client ID" value={id} onChange={(e) => setId(e.target.value)} /><input className="in" placeholder="Client secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} /></div>
    <div className="plg-inrow"><button type="button" className="btn" disabled={busy || !id || !secret} onClick={() => save()}>Use the client’s</button>{c.ownApp ? <button type="button" className="btn" disabled={busy} onClick={() => save(true)}>Use Lost Property’s</button> : null}</div>
    {err ? <p className="plg-bad">{err}</p> : null}
  </div>;
}

function CopyRow({ k, v }: { k: string; v: string }) {
  const [ok, setOk] = useState(false);
  return <div className="plg-copy"><span className="mute">{k}</span><code>{v}</code><button type="button" className="plg-x" aria-label={`Copy ${k}`} onClick={async () => { await navigator.clipboard.writeText(v); setOk(true); setTimeout(() => setOk(false), 1500); }}>{ok ? <Check {...I} /> : <Copy {...I} />}</button></div>;
}

/** The panel as it looks in every app, live, with this client's brand; and (for the lead) what it shows */
function PanelSheet({ slug, client, lead, panel, preview, onClose }: { slug: string; client: string; lead: boolean; panel: PanelSettings; preview: PanelBrand | null; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const router = useRouter();
  const [show, setShow] = useState(panel);
  const [note, setNote] = useState('');
  async function toggle(id: keyof PanelSettings) {
    const v = !show[id];
    setShow((s) => ({ ...s, [id]: v }));
    await fetch(`/api/p/${slug}/plugins`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ panel: { [id]: v } }) });
    router.refresh();
  }
  const host: PanelHostApi = {
    name: 'Preview',
    insertImage: async (img) => { setNote(`In an app, this places ${img.name} in the design`); },
    insertText: async () => { setNote('In an app, this adds the line to the page'); },
    copy: async (t) => { await navigator.clipboard.writeText(t); },
    ask: async (q, history) => {
      const r = await fetch(`/api/p/${slug}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [...history, { role: 'user', content: q }] }) });
      if (!r.ok) throw new Error(await r.text());
      return (await r.text()).trim();
    },
    openPortal: () => window.open(`/p/${slug}`, '_blank')
  };
  return <div className="plg-sheet-scrim" onClick={onClose}><aside className="plg-sheet" role="dialog" aria-modal="true" aria-label="Brand Panel" onClick={(e) => e.stopPropagation()}>
    <header className="plg-sheet-h"><div className="plg-sheet-id"><LpAppIcon size={36} /><div><p>Brand Panel</p><p className="mute">As it appears in Canva, Office and Google. Try it.</p></div></div><button type="button" className="plg-x" onClick={onClose} aria-label="Close"><X {...I} /></button></header>
    <div className="plg-frame">{preview ? <LpPanel brand={{ ...preview, show }} host={host} /> : <p className="mute plg-empty">Shows {client}’s brand once the guidelines are published.</p>}</div>
    {note ? <p className="mute plg-note">{note}</p> : null}
    {lead ? <div className="plg-shows"><p className="mute">What it shows</p><div className="plg-chips" aria-label="What the panel shows">{PANEL_PARTS.map(({ id, label }) => <button key={id} type="button" aria-pressed={show[id]} className={'plg-chip' + (show[id] ? ' on' : '')} onClick={() => toggle(id)}>{show[id] ? <Check size={11} strokeWidth={2.5} aria-hidden /> : null}{label}</button>)}</div></div> : null}
  </aside></div>;
}
