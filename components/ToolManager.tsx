'use client';
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Plus, Trash2, Upload, X } from 'lucide-react';
import { Icon, ICON_NAMES } from '@/lib/icons';

type Tool = { id: string; kind: 'html' | 'layouts'; name: string; icon: string; description: string; styling: 'full' | 'light' | 'none'; ai_enabled: boolean; visible: boolean; ord: number; updated_at: string; beta?: boolean };
const STYLING = { full: 'Platform look', light: 'Brand fonts', none: 'As uploaded' } as const;

// Studio: apps for this client, as cards like the downloads. Add one by uploading a self-contained HTML tool; the
// portal shows it as an app in the brand's look. Open a card to edit it, replace its file, reorder or remove it.
export function ToolManager({ projectId, slug }: { projectId: string; slug: string }) {
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', icon: 'grid', description: '', styling: 'full', ai: true });
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { fetch(`/api/projects/${projectId}/tools`).then((r) => r.json()).then((j) => setTools(j.tools || [])); }, [projectId]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const f = file.current?.files?.[0]; if (!f) { setMsg('Choose the app’s .html file.'); return; }
    const fd = new FormData(); fd.set('file', f); fd.set('name', form.name); fd.set('icon', form.icon); fd.set('description', form.description); fd.set('styling', form.styling); fd.set('ai', String(form.ai));
    setMsg('Uploading…');
    const r = await fetch(`/api/projects/${projectId}/tools`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'The upload didn’t go through.'); return; }
    setTools(j.tools); setOpen(null); setForm({ name: '', icon: 'grid', description: '', styling: 'full', ai: true }); setMsg('Added. Open it in the portal to check it looks right.');
  }
  async function patch(t: Tool, body: Partial<Tool>) { const r = await fetch(`/api/projects/${projectId}/tools/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (r.ok) setTools(j.tools); else setMsg(j.error || 'Couldn’t save.'); }
  async function replace(t: Tool, f?: File) { if (!f) return; const fd = new FormData(); fd.set('file', f); setMsg('Uploading…'); const r = await fetch(`/api/projects/${projectId}/tools/${t.id}`, { method: 'PATCH', body: fd }); const j = await r.json().catch(() => ({})); if (r.ok) { setTools(j.tools); setMsg(`${t.name} updated.`); } else setMsg(j.error || 'The upload didn’t go through.'); }
  async function remove(t: Tool) { if (!confirm(`Delete ${t.name}? People’s saved versions in it are kept but can’t be opened.`)) return; const r = await fetch(`/api/projects/${projectId}/tools/${t.id}`, { method: 'DELETE' }); const j = await r.json(); if (r.ok) { setTools(j.tools); setOpen(null); } else setMsg(j.error); }
  const move = (i: number, d: number) => { if (!tools) return; const l = [...tools]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; setTools(l); l.forEach((t, k) => { if (t.ord !== k) patch(t, { ord: k }); }); };

  const cur = tools?.find((t) => t.id === open);
  const ci = cur && tools ? tools.indexOf(cur) : -1;
  const icons = (v: string, set: (n: string) => void) => <div className="tl-icons" role="radiogroup" aria-label="Icon">{ICON_NAMES.map((n) => <button type="button" key={n} role="radio" aria-checked={v === n} aria-label={n} className={'tl-ipick' + (v === n ? ' on' : '')} onClick={() => set(n)}><Icon name={n} size={18} /></button>)}</div>;
  const seg = (v: string, set: (k: string) => void) => <div className="dp-seg" role="radiogroup" aria-label="Styling">{Object.entries(STYLING).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={v === k} className={v === k ? 'on' : ''} onClick={() => set(k)}>{l}</button>)}</div>;

  return (
    <div className="rm2">
      <div className="rm2-bar">
        <p className="mute">Apps built for this client: upload a self-contained HTML tool and it appears in their portal in the brand’s look. Clients can drive it by describing what they want.</p>
        <a className="btn" href={`/p/${slug}/resources#apps`} target="_blank" rel="noopener"><Eye size={14} strokeWidth={1.75} aria-hidden />See apps as the client</a>
      </div>
      {msg ? <p className="rm2-msg" role="status">{msg}<button type="button" onClick={() => setMsg('')} aria-label="Dismiss"><X size={14} strokeWidth={1.75} aria-hidden /></button></p> : null}
      <div className="rm2-grid">
        {tools === null ? <p className="mute">Loading…</p> : tools.map((t) => (
          <article key={t.id} className={'rm2-card' + (t.visible ? '' : ' dim')} tabIndex={0} role="button" aria-label={`${t.name}: open`} onClick={() => setOpen(t.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(t.id); }}>
            <div className="rm2-pv"><div className="rs-pv tl-pv"><span className="tl-pv-ic"><Icon name={t.icon} size={34} /></span></div></div>
            <div className="rm2-txt">
              <div className="rm2-top"><h3>{t.name}</h3>{t.beta ? <span className="beta-tag">Beta</span> : null}</div>
              <p className="rm2-meta"><span className={'rm2-dot ' + (t.visible ? 'live' : 'off')} aria-hidden />{t.visible ? 'Shown to the client' : 'Hidden'}{t.kind === 'html' ? (t.ai_enabled ? ' · AI on' : '') : ' · Built in'}</p>
              {t.description ? <span className="rm2-fresh">{t.description}</span> : null}
            </div>
          </article>))}
        {tools !== null ? <button type="button" className="rm2-card rm2-add" onClick={() => setOpen('new')}><Plus size={18} strokeWidth={1.75} aria-hidden />Add an app</button> : null}
      </div>
      <details className="rm2-help"><summary>Making an app work well with AI</summary><div className="mute">
        <p>“Platform look” restyles the interface: portal colours, brand fonts, type sizes, spacing, buttons and inputs. The artwork the app makes is left alone: canvases, SVGs and areas named like preview, poster, artboard or stage are found automatically. If part of the artwork gets restyled, give its CSS selector as the artwork area.</p>
        <p>The AI reads the app’s visible controls (inputs, dropdowns, buttons, editable text) and fills them in. Give each control a clear label and use dropdowns for fixed choices like sizes.</p>
        <p>Keep the app in one HTML file; scripts and fonts from CDNs are fine. Brand files are in <code>window.LP_BRAND.assets</code> and colours are CSS variables <code>--lp-colour-1</code> and up. Apps run in a protected frame; “Save this version” keeps people’s work in their account.</p>
      </div></details>

      {open ? <div className="rm2-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
        <aside className="rm2-pane" role="dialog" aria-modal="true" aria-label={cur ? cur.name : 'Add an app'}>
          <div className="rm2-pane-h"><strong>{cur ? cur.name : 'Add an app'}</strong><button type="button" className="rm2-ic" onClick={() => setOpen(null)} aria-label="Close"><X size={14} strokeWidth={1.75} aria-hidden /></button></div>
          {open === 'new' ? <form className="rm2-pane-b" onSubmit={add} id="tl-new">
            <label className="rm2-f"><span>The app’s HTML file</span><input ref={file} type="file" accept=".html,.htm,text/html" required /></label>
            <label className="rm2-f"><span>Name</span><input className="in" required maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Event poster maker" /></label>
            <label className="rm2-f"><span>What it does</span><input className="in" maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Makes A3 and A4 posters for events" /><small className="mute">Shown to the client, and read by the AI.</small></label>
            <div className="rm2-f"><span>Icon</span>{icons(form.icon, (n) => setForm({ ...form, icon: n }))}</div>
            <div className="rm2-f"><span>Styling</span>{seg(form.styling, (k) => setForm({ ...form, styling: k }))}</div>
            <label className="fp-check"><input type="checkbox" checked={form.ai} onChange={(e) => setForm({ ...form, ai: e.target.checked })} />Let clients drive it with AI</label>
          </form> : cur ? <div className="rm2-pane-b">
            <div className="rm2-pane-pv"><div className="rs-pv tl-pv"><span className="tl-pv-ic"><Icon name={cur.icon} size={44} /></span></div></div>
            <div className="rm2-row"><span className={'rm2-dot ' + (cur.visible ? 'live' : 'off')} aria-hidden /><span>{cur.visible ? 'Shown to the client' : 'Hidden from the client'}</span><span style={{ flex: 1 }} /><button className="btn" onClick={() => patch(cur, { visible: !cur.visible })}>{cur.visible ? <><EyeOff size={14} strokeWidth={1.75} aria-hidden />Hide</> : <><Eye size={14} strokeWidth={1.75} aria-hidden />Show</>}</button></div>
            <label className="rm2-f"><span>Name</span><input className="in" key={cur.id + 'n'} defaultValue={cur.name} onBlur={(e) => e.target.value.trim() && e.target.value !== cur.name && patch(cur, { name: e.target.value.trim() })} /></label>
            <label className="rm2-f"><span>What it does</span><input className="in" key={cur.id + 'd'} defaultValue={cur.description} placeholder="Shown to the client, and read by the AI" onBlur={(e) => e.target.value !== cur.description && patch(cur, { description: e.target.value })} /></label>
            <div className="rm2-f"><span>Icon</span>{icons(cur.icon, (n) => patch(cur, { icon: n }))}</div>
            {cur.kind === 'html' ? <>
              <div className="rm2-f"><span>Styling</span>{seg(cur.styling, (k) => patch(cur, { styling: k as Tool['styling'] }))}</div>
              {cur.styling === 'full' ? <ArtworkField projectId={projectId} toolId={cur.id} /> : null}
              <label className="fp-check"><input type="checkbox" checked={cur.ai_enabled} onChange={(e) => patch(cur, { ai_enabled: e.target.checked })} />Let clients drive it with AI</label>
            </> : <p className="mute">Built into the platform, so it can’t be replaced or deleted. Hide it if this client doesn’t need it.</p>}
            <label className="fp-check"><input type="checkbox" checked={!!cur.beta} onChange={(e) => patch(cur, { beta: e.target.checked })} />Mark as BETA<small className="mute"> · the client sees a Beta tag and a note that it’s a work in progress</small></label>
            <div className="rm2-row"><span className="mute">Order</span><button className="btn" onClick={() => move(ci, -1)} disabled={ci <= 0}>← Earlier</button><button className="btn" onClick={() => move(ci, 1)} disabled={!tools || ci >= tools.length - 1}>Later →</button></div>
          </div> : null}
          <div className="rm2-pane-f">
            {cur?.kind === 'html' ? <button className="btn" onClick={() => remove(cur)}><Trash2 size={14} strokeWidth={1.75} aria-hidden />Delete</button> : null}
            <span style={{ flex: 1 }} />
            {open === 'new' ? <button className="btn solid" form="tl-new" disabled={!form.name.trim()}><Upload size={14} strokeWidth={1.75} aria-hidden />Add the app</button>
              : cur ? <>{cur.kind === 'html' ? <label className="btn"><Upload size={14} strokeWidth={1.75} aria-hidden />Replace the file<input type="file" accept=".html,.htm" hidden onChange={(e) => replace(cur, e.target.files?.[0])} /></label> : null}<a className="btn solid" href={`/p/${slug}/tools/${cur.id}`} target="_blank" rel="noopener">Open in the portal ↗</a></> : null}
          </div>
        </aside>
      </div> : null}
    </div>
  );
}

// The part of a tool that is the artwork (kept exactly as the tool draws it when the interface is reskinned)
function ArtworkField({ projectId, toolId }: { projectId: string; toolId: string }) {
  const [v, setV] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  useEffect(() => { fetch(`/api/projects/${projectId}/tools/${toolId}`).then((r) => r.json()).then((j) => setV(j.settings?.artwork || '')); }, [projectId, toolId]);
  if (v === null) return null;
  const save = async () => { const r = await fetch(`/api/projects/${projectId}/tools/${toolId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artwork: v }) }); setSaved(r.ok ? 'Saved' : 'Couldn’t save'); setTimeout(() => setSaved(''), 1500); };
  return <div className="rm2-f"><label className="mute" htmlFor={`aw-${toolId}`} style={{ fontSize: 12 }}>Artwork area</label><input id={`aw-${toolId}`} className="in" placeholder="Found automatically. Or a CSS selector, e.g. #poster" value={v} onChange={(e) => setV(e.target.value)} onBlur={save} /><span className="mute">{saved}</span></div>;
}
