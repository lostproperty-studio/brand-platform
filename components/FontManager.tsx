'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import { DEFAULT_ROLES, fontFaceCss, fontState, weightName, type FontFile, type ProjectFont } from '@/lib/fonts';

const STATE_LABEL = { none: 'No files yet', trial: 'Trial files', mixed: 'Part licensed', licensed: 'Licensed' } as const;
const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;

// Typefaces as tiles: each shows the face itself, what it's used for and whether it's licensed. Open one to name it,
// drop in its files (trial to design with, licensed for delivery) and see every weight. Saves as you go.
// `detected` seeds empty projects with the family names the Figma scan found.
export function FontManager({ projectId, detected = [] }: { projectId: string; detected?: string[] }) {
  const [fonts, setFonts] = useState<ProjectFont[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [openRole, setOpenRole] = useState<string | null>(null);
  const seeded = useRef(false);

  const apply = (j: { fonts: ProjectFont[]; urls: Record<string, string>; problems?: string[]; replaced?: number; error?: string }) => {
    if (j.fonts) { setFonts(j.fonts); setUrls(j.urls || {}); }
    const parts = [j.error, ...(j.problems || []), j.replaced ? `Replaced ${j.replaced} trial file${j.replaced > 1 ? 's' : ''} with the licensed version.` : ''].filter(Boolean);
    setMsg(parts.length ? parts.join(' ') : 'Saved');
    if (!parts.length) setTimeout(() => setMsg(''), 1400);
  };
  async function saveMeta(next: ProjectFont[]) {
    setFonts(next);
    const r = await fetch(`/api/projects/${projectId}/fonts`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fonts: next.map(({ role, label, name, licenceNote }) => ({ role, label, name, licenceNote })) }) });
    apply(await r.json());
  }
  useEffect(() => {
    fetch(`/api/projects/${projectId}/fonts`).then((r) => r.json()).then((j) => {
      if (!j.fonts?.length && !seeded.current) { seeded.current = true; saveMeta(DEFAULT_ROLES.map((d, k) => ({ ...d, name: detected[k] || '', licenceNote: '', files: [] }))); }
      else apply(j);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const css = useMemo(() => (fonts ? fontFaceCss(fonts, urls) : ''), [fonts, urls]);
  if (!fonts) return <p className="mute">Loading typefaces…</p>;
  const edit = (role: string, patch: Partial<ProjectFont>) => setFonts(fonts.map((f) => (f.role === role ? { ...f, ...patch } : f)));
  const addTypeface = () => { const role = `font-${Date.now().toString(36)}`; saveMeta([...fonts, { role, label: `Typeface ${fonts.length + 1}`, name: '', licenceNote: '', files: [] }]); setOpenRole(role); };
  const counts = { licensed: fonts.filter((f) => fontState(f) === 'licensed').length, trial: fonts.filter((f) => ['trial', 'mixed'].includes(fontState(f))).length, none: fonts.filter((f) => fontState(f) === 'none').length };
  const open = fonts.find((f) => f.role === openRole);

  return (
    <div className="ft">
      <style>{css}</style>
      <div className="ft-top">
        <p className="ft-sum"><strong>{fonts.length} typeface{fonts.length === 1 ? '' : 's'}</strong>{counts.licensed ? <span className="ft-pill s-licensed">{counts.licensed} licensed</span> : null}{counts.trial ? <span className="ft-pill s-trial">{counts.trial} on trial files</span> : null}{counts.none ? <span className="ft-pill s-none">{counts.none} without files</span> : null}</p>
        <span className="mute" role="status">{msg}</span>
      </div>
      <p className="mute ft-help">Design with trial files; when the client buys the licences, add the licensed files and each one replaces its trial weight. Only licensed files go into the kit.</p>
      <div className="ft-grid">
        {fonts.map((f) => {
          const st = fontState(f), regular = f.files.find((x) => x.style === 'normal' && x.weight === 400) || f.files[0];
          const lic = f.files.filter((x) => x.licence === 'licensed').length;
          return <button key={f.role} type="button" className="ft-tile" onClick={() => setOpenRole(f.role)} aria-label={`${f.name || 'Unnamed typeface'}, ${f.label}. ${STATE_LABEL[st]}. Open`}>
            <span className="ft-spec" style={f.files.length ? { fontFamily: `"brand-${f.role}", sans-serif`, fontWeight: regular?.weight, fontStyle: regular?.style } : undefined}>{f.files.length ? 'Aa' : <Upload size={22} strokeWidth={1.5} aria-hidden />}</span>
            <span className="ft-name">{f.name || 'Unnamed typeface'}</span>
            <span className="ft-use">{f.label}</span>
            <span className="ft-meta"><span className={'ft-pill s-' + st}>{STATE_LABEL[st]}</span>{f.files.length ? <span className="mute">{f.files.length} file{f.files.length === 1 ? '' : 's'}{st === 'mixed' ? ` · ${lic} licensed` : ''}</span> : null}</span>
          </button>;
        })}
        <button type="button" className="ft-tile ft-add" onClick={addTypeface}><Plus size={20} strokeWidth={1.5} aria-hidden /><span>Add a typeface</span></button>
      </div>
      {open ? <FontSheet font={open} projectId={projectId} onClose={() => setOpenRole(null)} onEdit={(p) => edit(open.role, p)} onBlur={() => saveMeta(fonts)}
        onRemove={fonts.length > 1 ? () => { if (confirm(`Remove ${open.name || open.label} and its files?`)) { saveMeta(fonts.filter((x) => x.role !== open.role)); setOpenRole(null); } } : undefined} onResult={apply} msg={msg} /> : null}
    </div>
  );
}

function FontSheet({ font: f, projectId, onClose, onEdit, onBlur, onRemove, onResult, msg }: { font: ProjectFont; projectId: string; onClose: () => void; onEdit: (p: Partial<ProjectFont>) => void; onBlur: () => void; onRemove?: () => void; onResult: (j: never) => void; msg: string }) {
  const trialIn = useRef<HTMLInputElement>(null), licIn = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState('');
  const [over, setOver] = useState<FontFile['licence'] | null>(null);
  const [sample, setSample] = useState('The quick brown fox jumps over the lazy dog');
  const state = fontState(f);
  const looksTrial = /\b(trial|test)\b/i.test(f.name);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); document.body.style.overflow = 'hidden'; return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; }; }, [onClose]);

  async function upload(list: FileList | File[] | null, licence: FontFile['licence']) {
    const files = [...(list || [])].filter((x) => /\.(woff2?|otf|ttf)$/i.test(x.name));
    if (!files.length) return;
    let last: unknown = null;
    // One request per file keeps each upload under the hosting size limit
    for (const [k, file] of files.entries()) {
      setUploading(`Uploading ${k + 1} of ${files.length}…`);
      const fd = new FormData(); fd.set('role', f.role); fd.set('licence', licence); fd.append('files', file);
      last = await (await fetch(`/api/projects/${projectId}/fonts`, { method: 'POST', body: fd })).json();
    }
    setUploading('');
    if (last) onResult(last as never);
  }
  const patchFile = async (path: string, body: Record<string, unknown>) => onResult(await (await fetch(`/api/projects/${projectId}/fonts`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: f.role, path, ...body }) })).json() as never);
  const removeFile = async (path: string) => onResult(await (await fetch(`/api/projects/${projectId}/fonts?role=${encodeURIComponent(f.role)}&path=${encodeURIComponent(path)}`, { method: 'DELETE' })).json() as never);
  const files = [...f.files].sort((a, b) => a.weight - b.weight || (a.style === 'italic' ? 1 : -1));
  const zone = (licence: FontFile['licence']) => <div className={'ft-drop' + (over === licence ? ' over' : '')} onDragOver={(e) => { e.preventDefault(); setOver(licence); }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); setOver(null); upload(e.dataTransfer.files, licence); }}>
    <Upload size={18} strokeWidth={1.5} aria-hidden />
    <p><strong>{licence === 'trial' ? 'Trial files' : state === 'trial' || state === 'mixed' ? 'Licensed files' : 'Licensed files'}</strong><span className="mute">{licence === 'trial' ? 'To design with. Never go into the kit.' : state === 'trial' || state === 'mixed' ? 'Each one replaces its trial weight.' : 'These go into the kit.'}</span></p>
    <button type="button" className={'btn' + (licence === 'licensed' && (state === 'trial' || state === 'mixed') ? ' solid' : '')} disabled={!!uploading} onClick={() => (licence === 'trial' ? trialIn : licIn).current?.click()}>Choose files</button>
  </div>;

  return createPortal(<div className="sh-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="sh" role="dialog" aria-modal="true" aria-label={f.name || 'Typeface'}>
      <header className="sh-h"><h2 style={f.files.length ? { fontFamily: `"brand-${f.role}", sans-serif` } : undefined}>{f.name || 'Unnamed typeface'}</h2><span className={'ft-pill s-' + state}>{STATE_LABEL[state]}</span><button type="button" className="sh-x" onClick={onClose} aria-label="Close"><X size={18} strokeWidth={1.75} aria-hidden /></button></header>
      <div className="sh-b">
        <div className="ft-fields">
          <label><span className="mute">Typeface name</span><input className="in" value={f.name} placeholder="e.g. KMR Waldenburg" onChange={(e) => onEdit({ name: e.target.value })} onBlur={onBlur} /></label>
          <label><span className="mute">Used for</span><input className="in" value={f.label} placeholder="e.g. Headlines" onChange={(e) => onEdit({ label: e.target.value })} onBlur={onBlur} /></label>
        </div>
        {looksTrial ? <p className="mute" style={{ margin: 0 }}>The Figma file uses a trial version. Give the family its real name; trial or licensed is tracked on each file.</p> : null}

        {files.length ? <>
          <div className="ft-sample"><input className="ft-sample-in" value={sample} onChange={(e) => setSample(e.target.value)} aria-label="Sample text" /></div>
          <ul className="ft-weights">{files.map((x) => <li key={x.path} className="ft-w">
            <p className="ft-w-spec" style={{ fontFamily: `"brand-${f.role}", sans-serif`, fontWeight: x.weight, fontStyle: x.style }}>{sample || 'Aa'}</p>
            <div className="ft-w-ctl">
              <select className="fm-sel" aria-label={`Weight of ${x.name}`} value={x.weight} onChange={(e) => patchFile(x.path, { weight: Number(e.target.value) })}>{WEIGHTS.map((w) => <option key={w} value={w}>{weightName(w)} {w}</option>)}</select>
              <select className="fm-sel" aria-label={`Style of ${x.name}`} value={x.style} onChange={(e) => patchFile(x.path, { style: e.target.value })}><option value="normal">Upright</option><option value="italic">Italic</option></select>
              <button type="button" className={'fm-lic ' + x.licence} onClick={() => patchFile(x.path, { licence: x.licence === 'trial' ? 'licensed' : 'trial' })} title="Switch between trial and licensed">{x.licence === 'trial' ? 'Trial' : 'Licensed'}</button>
              <span className="mute ft-w-file" title={x.name}>{x.name}</span>
              <button type="button" className="ft-w-x" onClick={() => removeFile(x.path)} aria-label={`Remove ${x.name}`}><X size={14} strokeWidth={1.75} aria-hidden /></button>
            </div>
          </li>)}</ul>
        </> : <p className="mute" style={{ margin: 0 }}>No files yet. Drop them in below: .woff2 is best for the web, .otf or .ttf for desktop.</p>}

        <input ref={trialIn} type="file" accept=".woff2,.woff,.otf,.ttf" multiple hidden onChange={(e) => { upload(e.target.files, 'trial'); e.target.value = ''; }} />
        <input ref={licIn} type="file" accept=".woff2,.woff,.otf,.ttf" multiple hidden onChange={(e) => { upload(e.target.files, 'licensed'); e.target.value = ''; }} />
        <div className="ft-drops">{zone('trial')}{zone('licensed')}</div>
        {uploading || msg ? <p className="mute" role="status" style={{ margin: 0 }}>{uploading || msg}</p> : null}

        {state === 'licensed' || state === 'mixed' ? <label className="ft-lic"><span className="mute">What the licence covers</span><input className="in" value={f.licenceNote || ''} placeholder="e.g. Web + desktop, 5 users, client and suppliers" onChange={(e) => onEdit({ licenceNote: e.target.value })} onBlur={onBlur} /></label> : null}
        {onRemove ? <button type="button" className="btn ic ft-remove" onClick={onRemove}><Trash2 {...I} />Remove this typeface</button> : null}
      </div>
    </aside>
  </div>, document.body);
}
