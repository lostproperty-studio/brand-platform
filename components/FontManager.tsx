'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_ROLES, fontFaceCss, fontState, weightName, type FontFile, type ProjectFont } from '@/lib/fonts';

const STATE_LABEL = { none: 'No files yet', trial: 'Trial files', mixed: 'Part licensed', licensed: 'Licensed' } as const;
const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

// Typefaces: name each one, upload trial files to design with, then swap in licensed files before delivery.
// Saves as you go. `detected` seeds empty projects with the family names the Figma scan found.
export function FontManager({ projectId, detected = [] }: { projectId: string; detected?: string[] }) {
  const [fonts, setFonts] = useState<ProjectFont[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
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
      if (!j.fonts?.length && !seeded.current) {
        seeded.current = true;
        saveMeta(DEFAULT_ROLES.map((d, k) => ({ ...d, name: detected[k] || '', licenceNote: '', files: [] })));
      } else apply(j);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const css = useMemo(() => (fonts ? fontFaceCss(fonts, urls) : ''), [fonts, urls]);
  if (!fonts) return <p className="mute">Loading typefaces…</p>;

  const edit = (role: string, patch: Partial<ProjectFont>) => setFonts(fonts.map((f) => (f.role === role ? { ...f, ...patch } : f)));
  const addTypeface = () => { const n = fonts.length + 1; saveMeta([...fonts, { role: `font-${Date.now().toString(36)}`, label: `Typeface ${n}`, name: '', licenceNote: '', files: [] }]); };

  return (
    <div className="fm">
      <style>{css}</style>
      {fonts.map((f) => <FontCard key={f.role} font={f} projectId={projectId} onEdit={(p) => edit(f.role, p)} onBlur={() => saveMeta(fonts)} onRemove={fonts.length > 1 ? () => { if (confirm(`Remove ${f.name || f.label} and its files?`)) saveMeta(fonts.filter((x) => x.role !== f.role)); } : undefined} onResult={apply} />)}
      <div className="row"><button className="btn" onClick={addTypeface}>+ Add a typeface</button><span className="mute" role="status">{msg}</span></div>
    </div>
  );
}

function FontCard({ font: f, projectId, onEdit, onBlur, onRemove, onResult }: { font: ProjectFont; projectId: string; onEdit: (p: Partial<ProjectFont>) => void; onBlur: () => void; onRemove?: () => void; onResult: (j: never) => void }) {
  const trialInput = useRef<HTMLInputElement>(null);
  const licInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState('');
  const state = fontState(f);
  const looksTrial = /\b(trial|test)\b/i.test(f.name);

  async function upload(list: FileList | null, licence: FontFile['licence']) {
    if (!list?.length) return;
    // One request per file keeps each upload under the hosting size limit.
    let last: unknown = null;
    for (const [k, file] of [...list].entries()) {
      setUploading(`Uploading ${k + 1} of ${list.length}…`);
      const fd = new FormData(); fd.set('role', f.role); fd.set('licence', licence); fd.append('files', file);
      const r = await fetch(`/api/projects/${projectId}/fonts`, { method: 'POST', body: fd });
      last = await r.json();
    }
    setUploading('');
    if (last) onResult(last as never);
  }
  const patchFile = async (path: string, body: Record<string, unknown>) => onResult(await (await fetch(`/api/projects/${projectId}/fonts`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: f.role, path, ...body }) })).json() as never);
  const removeFile = async (path: string) => onResult(await (await fetch(`/api/projects/${projectId}/fonts?role=${encodeURIComponent(f.role)}&path=${encodeURIComponent(path)}`, { method: 'DELETE' })).json() as never);

  return (
    <section className="fm-card">
      <div className="fm-head">
        <input className="in fm-label" aria-label="What it's used for" value={f.label} placeholder="Used for, e.g. Headlines" onChange={(e) => onEdit({ label: e.target.value })} onBlur={onBlur} />
        <span className={'fm-state s-' + state}>{STATE_LABEL[state]}</span>
        {onRemove ? <button className="btn" onClick={onRemove} aria-label={`Remove ${f.label}`}>Remove</button> : null}
      </div>
      <label className="mute" htmlFor={`n-${f.role}`}>Typeface name</label>
      <input id={`n-${f.role}`} className="in" value={f.name} placeholder="e.g. KMR Waldenburg" onChange={(e) => onEdit({ name: e.target.value })} onBlur={onBlur} />
      {looksTrial ? <p className="mute" style={{ margin: 0 }}>The Figma file uses a trial version. Give the family its real name; the trial status is tracked on the files below.</p> : null}

      {f.files.length ? <p className="fm-specimen" style={{ fontFamily: `"brand-${f.role}", sans-serif` }}>{f.name || 'Aa'} — The quick brown fox, 0123456789</p> : null}

      <div className="fm-files">
        {f.files.map((x) => (
          <div key={x.path} className="fm-file">
            <span className="fm-fname" style={{ fontFamily: `"brand-${f.role}", sans-serif`, fontWeight: x.weight, fontStyle: x.style }}>{x.name}</span>
            <select className="fm-sel" aria-label={`Weight of ${x.name}`} value={x.weight} onChange={(e) => patchFile(x.path, { weight: Number(e.target.value) })}>{WEIGHTS.map((w) => <option key={w} value={w}>{weightName(w)}</option>)}</select>
            <select className="fm-sel" aria-label={`Style of ${x.name}`} value={x.style} onChange={(e) => patchFile(x.path, { style: e.target.value })}><option value="normal">Upright</option><option value="italic">Italic</option></select>
            <button className={'fm-lic ' + x.licence} onClick={() => patchFile(x.path, { licence: x.licence === 'trial' ? 'licensed' : 'trial' })} title="Switch between trial and licensed">{x.licence === 'trial' ? 'Trial' : 'Licensed'}</button>
            <button className="fm-x" onClick={() => removeFile(x.path)} aria-label={`Remove ${x.name}`}>×</button>
          </div>
        ))}
      </div>

      <div className="row">
        <input ref={trialInput} type="file" accept=".woff2,.woff,.otf,.ttf" multiple hidden onChange={(e) => { upload(e.target.files, 'trial'); e.target.value = ''; }} />
        <input ref={licInput} type="file" accept=".woff2,.woff,.otf,.ttf" multiple hidden onChange={(e) => { upload(e.target.files, 'licensed'); e.target.value = ''; }} />
        <button className="btn" disabled={!!uploading} onClick={() => trialInput.current?.click()}>Upload trial files</button>
        <button className={'btn' + (state === 'trial' || state === 'mixed' ? ' solid' : '')} disabled={!!uploading} onClick={() => licInput.current?.click()}>{state === 'trial' || state === 'mixed' ? 'Replace with licensed files' : 'Upload licensed files'}</button>
        <span className="mute">{uploading || '.woff2 is best for the web; .otf/.ttf for desktop'}</span>
      </div>

      {state === 'licensed' || state === 'mixed' ? <>
        <label className="mute" htmlFor={`l-${f.role}`}>What the licence covers</label>
        <input id={`l-${f.role}`} className="in" value={f.licenceNote || ''} placeholder="e.g. Web + desktop, 5 users, client and suppliers" onChange={(e) => onEdit({ licenceNote: e.target.value })} onBlur={onBlur} />
      </> : <p className="mute" style={{ margin: 0 }}>Trial files are fine for designing and previews. They’re never put in the kit, and you’ll be reminded to swap them for licensed files before publishing.</p>}
    </section>
  );
}
