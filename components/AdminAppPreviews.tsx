'use client';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { AppIcon } from '@/components/portal/AppIcon';
import { FRAGMENTS, type AppPreview, type AppPreviews, type Feature, type Fragment } from '@/lib/portal/appPreviews';
import type { AppKey } from '@/lib/portalVersion';

// Admin settings → App previews: the wording and features on each app's About page (and its coming-soon preview).
// Pick an app, change the headline and lines, and choose which features show, in what order, with which picture.
const APPS: [AppKey, string][] = [['writer', 'Writer'], ['director', 'Director'], ['photographer', 'Photographer'], ['designer', 'Designer']];
const GROUPS = [...new Set(FRAGMENTS.map((f) => f.group))];

export function AdminAppPreviews({ example }: { example: string | null }) {
  const [all, setAll] = useState<AppPreviews | null>(null);
  const [app, setApp] = useState<AppKey>('writer');
  const [p, setP] = useState<AppPreview | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { fetch('/api/admin/app-previews').then((r) => r.json()).then((j) => setAll(j.previews)).catch(() => setMsg('Couldn’t load the previews.')); }, []);
  useEffect(() => { if (all) { setP(structuredClone(all[app])); setDirty(false); setMsg(''); } }, [all, app]);
  if (!all || !p) return <p className="mute">{msg || 'Loading…'}</p>;

  const set = (v: Partial<AppPreview>) => { setP({ ...p, ...v }); setDirty(true); };
  const setF = (i: number, v: Partial<Feature>) => set({ features: p.features.map((f, k) => (k === i ? { ...f, ...v } : f)) });
  const move = (i: number, d: number) => { const f = [...p.features]; const j = i + d; if (j < 0 || j >= f.length) return; [f[i], f[j]] = [f[j], f[i]]; set({ features: f }); };
  const save = async () => {
    setBusy(true); setMsg('');
    const r = await fetch('/api/admin/app-previews', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app, preview: p }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(j.error || 'Couldn’t save.'); return; }
    setAll({ ...all, [app]: p }); setMsg('Saved. It’s live on every portal.');
  };
  const reset = async () => {
    setBusy(true);
    const r = await fetch(`/api/admin/app-previews?app=${app}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (j.preview) { setAll({ ...all, [app]: j.preview }); setMsg('Back to the original wording.'); }
  };
  const shown = p.features.filter((f) => !f.off).length;

  return <div className="ape">
    <div className="ape-apps" role="tablist" aria-label="App">{APPS.map(([k, n]) => <button key={k} role="tab" aria-selected={app === k} className={'ape-app' + (app === k ? ' on' : '')} onClick={() => { if (dirty && !confirm('Leave without saving?')) return; setApp(k); }}><AppIcon app={k} size={16} still />{n}</button>)}</div>
    <p className="mute ape-lede">What people see on {APPS.find((a) => a[0] === app)![1]}’s About page, and on its preview while it’s coming soon. Write it about what the client gets.{example ? <> <a href={`/p/${example}/preview/${app}`} target="_blank" rel="noreferrer">See it</a></> : null}</p>
    <label className="ape-f"><span>On hover</span><input className="in" value={p.teaser} onChange={(e) => set({ teaser: e.target.value })} maxLength={140} /></label>
    <label className="ape-f"><span>Headline</span><input className="in" value={p.headline} onChange={(e) => set({ headline: e.target.value })} maxLength={120} /></label>
    <label className="ape-f"><span>Line</span><textarea className="in ape-ta" value={p.line} onChange={(e) => set({ line: e.target.value })} maxLength={300} rows={2} /></label>
    <p className="ape-h">Features <span className="mute">{shown} shown</span></p>
    <ol className="ape-list">
      {p.features.map((f, i) => <li key={i} className={'ape-row' + (f.off ? ' off' : '')}>
        <div className="ape-main">
          <input className="in ape-t" value={f.title} onChange={(e) => setF(i, { title: e.target.value })} maxLength={60} aria-label="Feature title" placeholder="Title" />
          <input className="in" value={f.text} onChange={(e) => setF(i, { text: e.target.value })} maxLength={160} aria-label="Feature line" placeholder="One line about what they get" />
          <div className="ape-opts">
            <select className="in ape-sel" value={f.ui} onChange={(e) => setF(i, { ui: e.target.value as Fragment })} aria-label="Picture">
              {GROUPS.map((g) => <optgroup key={g} label={g}>{FRAGMENTS.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}
            </select>
            <label className="ape-chk"><input type="checkbox" checked={!!f.expert} onChange={(e) => setF(i, { expert: e.target.checked })} />Expert direction</label>
          </div>
        </div>
        <div className="ape-acts">
          <button className="btn ic" onClick={() => setF(i, { off: !f.off })} title={f.off ? 'Show it' : 'Hide it'} aria-label={f.off ? 'Show this feature' : 'Hide this feature'}>{f.off ? <EyeOff size={14} /> : <Eye size={14} />}</button>
          <button className="btn ic" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp size={14} /></button>
          <button className="btn ic" onClick={() => move(i, 1)} disabled={i === p.features.length - 1} aria-label="Move down"><ArrowDown size={14} /></button>
          <button className="btn ic" onClick={() => set({ features: p.features.filter((_, k) => k !== i) })} aria-label="Delete this feature"><Trash2 size={14} /></button>
        </div>
      </li>)}
    </ol>
    <button className="btn ape-add" onClick={() => set({ features: [...p.features, { title: 'New feature', text: '', ui: 'request' }] })}><Plus size={14} />Add a feature</button>
    <div className="row ape-save">
      <button className="btn solid" onClick={save} disabled={busy || !dirty}>{busy ? <Loader2 size={15} className="spin" aria-hidden /> : null}Save</button>
      <button className="btn" onClick={reset} disabled={busy}><RotateCcw size={14} />Original wording</button>
      <span className="mute" role="status">{msg || (dirty ? 'Not saved yet' : '')}</span>
    </div>
  </div>;
}
