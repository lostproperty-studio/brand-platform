'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon, ICON_NAMES } from '@/lib/icons';

type Tool = { id: string; kind: 'html' | 'layouts'; name: string; icon: string; description: string; styling: 'full' | 'light' | 'none'; ai_enabled: boolean; visible: boolean; ord: number; updated_at: string };
const STYLING = { full: 'Platform look', light: 'Brand fonts only', none: 'As uploaded' } as const;

// Studio: tools for this client. Upload a self-contained HTML tool; the portal shows it as an app in the brand's look.
export function ToolManager({ projectId, slug }: { projectId: string; slug: string }) {
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [msg, setMsg] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', icon: 'grid', description: '', styling: 'full', ai: true });
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { fetch(`/api/projects/${projectId}/tools`).then((r) => r.json()).then((j) => setTools(j.tools || [])); }, [projectId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const f = file.current?.files?.[0]; if (!f) { setMsg('Choose the tool’s .html file.'); return; }
    const fd = new FormData(); fd.set('file', f); fd.set('name', form.name); fd.set('icon', form.icon); fd.set('description', form.description); fd.set('styling', form.styling); fd.set('ai', String(form.ai));
    setMsg('Uploading…');
    const r = await fetch(`/api/projects/${projectId}/tools`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'Upload failed.'); return; }
    setTools(j.tools); setAdding(false); setForm({ name: '', icon: 'grid', description: '', styling: 'full', ai: true }); setMsg('Added. Open it in the portal to check it looks right.');
  }
  async function patch(t: Tool, body: Partial<Tool>) { const r = await fetch(`/api/projects/${projectId}/tools/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (r.ok) setTools(j.tools); }
  async function replace(t: Tool, f?: File) { if (!f) return; const fd = new FormData(); fd.set('file', f); setMsg('Uploading…'); const r = await fetch(`/api/projects/${projectId}/tools/${t.id}`, { method: 'PATCH', body: fd }); const j = await r.json().catch(() => ({})); if (r.ok) { setTools(j.tools); setMsg(`${t.name} updated.`); } else setMsg(j.error || 'Upload failed.'); }
  async function remove(t: Tool) { if (!confirm(`Delete ${t.name}? People’s saved versions in it are kept but can’t be opened.`)) return; const r = await fetch(`/api/projects/${projectId}/tools/${t.id}`, { method: 'DELETE' }); const j = await r.json(); if (r.ok) setTools(j.tools); else setMsg(j.error); }
  const move = (i: number, d: number) => { if (!tools) return; const l = [...tools]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; setTools(l); l.forEach((t, k) => { if (t.ord !== k) patch(t, { ord: k }); }); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 880 }}>
      <p className="mute" style={{ margin: 0 }}>Upload an HTML tool you’ve built for this client and it appears as an app in their portal. The platform applies the brand fonts and the portal’s look to anything the tool doesn’t style itself, gives it the brand files (<code>window.LP_BRAND</code>), and, with AI on, lets the client drive it by describing what they want. The tool works as it did before.</p>
      <div className="row"><button className="btn solid" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '+ Add a tool'}</button><a className="btn" href={`/p/${slug}/tools`} target="_blank" rel="noopener">Open Tools in the portal ↗</a><span className="mute" role="status">{msg}</span></div>
      {adding ? <form className="card ge-chhead" onSubmit={add}>
        <div className="ge-two">
          <div className="cv-f"><label className="mute" htmlFor="tl-n">Name</label><input id="tl-n" className="in" required maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Event poster maker" /></div>
          <div className="cv-f"><label className="mute" htmlFor="tl-f">HTML file</label><input id="tl-f" ref={file} type="file" accept=".html,.htm,text/html" required /></div>
        </div>
        <div className="cv-f"><label className="mute" htmlFor="tl-d">What it does (shown to the client, and used by the AI)</label><input id="tl-d" className="in" maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Makes A3 and A4 posters for Tileyard events" /></div>
        <div className="cv-f"><span className="mute">Icon</span><div className="tl-icons" role="radiogroup" aria-label="Icon">{ICON_NAMES.map((n) => <button type="button" key={n} role="radio" aria-checked={form.icon === n} aria-label={n} className={'tl-ipick' + (form.icon === n ? ' on' : '')} onClick={() => setForm({ ...form, icon: n })}><Icon name={n} size={20} /></button>)}</div></div>
        <div className="ge-two">
          <div className="cv-f"><label className="mute" htmlFor="tl-s">Styling</label><select id="tl-s" className="in" value={form.styling} onChange={(e) => setForm({ ...form, styling: e.target.value })}>{Object.entries(STYLING).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <label className="row" style={{ alignSelf: 'end' }}><input type="checkbox" checked={form.ai} onChange={(e) => setForm({ ...form, ai: e.target.checked })} /> Let clients drive it with AI</label>
        </div>
        <div className="row"><button className="btn solid">Add tool</button></div>
      </form> : null}
      {tools === null ? <p className="mute">Loading…</p> : tools.map((t, i) => (
        <div key={t.id} className={'card tl-row' + (t.visible ? '' : ' off')}>
          <span className="tl-icon sm"><Icon name={t.icon} size={18} /></span>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input className="in" aria-label="Tool name" defaultValue={t.name} onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && patch(t, { name: e.target.value.trim() })} />
            <input className="in" aria-label="Description" defaultValue={t.description} placeholder="What it does" onBlur={(e) => e.target.value !== t.description && patch(t, { description: e.target.value })} />
            <div className="row">
              <select className="fm-sel" aria-label="Icon" value={t.icon} onChange={(e) => patch(t, { icon: e.target.value })}>{ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
              {t.kind === 'html' ? <select className="fm-sel" aria-label="Styling" value={t.styling} onChange={(e) => patch(t, { styling: e.target.value as Tool['styling'] })}>{Object.entries(STYLING).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select> : <span className="tag">Built in</span>}
              {t.kind === 'html' ? <label className="row mute"><input type="checkbox" checked={t.ai_enabled} onChange={(e) => patch(t, { ai_enabled: e.target.checked })} /> AI</label> : null}
            </div>
          </div>
          <div className="row" style={{ alignSelf: 'flex-start' }}>
            <button className="btn" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button className="btn" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button className="btn" onClick={() => patch(t, { visible: !t.visible })}>{t.visible ? 'Hide' : 'Show'}</button>
            {t.kind === 'html' ? <label className="btn">Replace file<input type="file" accept=".html,.htm" hidden onChange={(e) => replace(t, e.target.files?.[0])} /></label> : null}
            {t.kind === 'html' ? <button className="btn" onClick={() => remove(t)}>Delete</button> : null}
          </div>
        </div>))}
      <details className="card"><summary>Making a tool work well with AI</summary><div className="mute" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        <p style={{ margin: 0 }}>The AI reads the tool’s visible controls (inputs, dropdowns, buttons, editable text) and fills them in. Give each control a clear label (a &lt;label&gt;, aria-label or placeholder) and use dropdowns for fixed choices like sizes.</p>
        <p style={{ margin: 0 }}>Keep the tool in one HTML file. Scripts and fonts from CDNs are fine. Brand files are available as <code>window.LP_BRAND.assets</code> (logo SVGs, tokens) and brand colours as CSS variables <code>--lp-colour-1</code> and up.</p>
        <p style={{ margin: 0 }}>Tools run in a protected frame. Browser storage is kept per person on their device; “Save this version” in the portal keeps their work in their account.</p>
      </div></details>
    </div>
  );
}
