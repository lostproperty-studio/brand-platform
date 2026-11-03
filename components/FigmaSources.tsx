'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, BookOpen, Download, Figma, Link2, Loader2, Package, PenLine } from 'lucide-react';

export type SourceRow = { url: string; file?: string; pageName?: string; importedAt?: string } | null;
const ago = (d: string) => { const s = (Date.now() - new Date(d).getTime()) / 1000, h = s / 3600, dd = h / 24; return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : h < 24 ? `${Math.round(h)} h ago` : dd < 7 ? `${Math.round(dd)} day${Math.round(dd) === 1 ? '' : 's'} ago` : new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;

// The two Figma links: one for the brand assets (logos, fonts, colours, the brand form), one for the guidelines.
// They can point at the same file; each is imported on its own.
export function FigmaSources({ projectId, assets, guidelines, thumb }: { projectId: string; assets: SourceRow; guidelines: SourceRow; thumb?: string }) {
  return <>
    <SourceLink projectId={projectId} part="assets" row={assets} fallback={guidelines} />
    <SourceLink projectId={projectId} part="guidelines" row={guidelines} thumb={thumb} />
  </>;
}

function SourceLink({ projectId, part, row, fallback, thumb }: { projectId: string; part: 'assets' | 'guidelines'; row: SourceRow; fallback?: SourceRow; thumb?: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(row?.url || '');
  const [busy, setBusy] = useState<'' | 'save' | 'import'>('');
  const [msg, setMsg] = useState('');
  const label = part === 'assets' ? 'Brand assets' : 'Guidelines';
  const Ic = part === 'assets' ? Package : BookOpen;
  const using = row || fallback;
  async function save() {
    setBusy('save'); setMsg('');
    const r = await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sources: { [part]: url.trim() || null } }) });
    const j = await r.json().catch(() => ({}));
    setBusy('');
    if (!r.ok) { setMsg(j.error || 'Couldn’t save that link.'); return; }
    setEditing(false); router.refresh();
  }
  async function importAssets() {
    setBusy('import'); setMsg('Reading logos, fonts, colours and the brand form…');
    const r = await fetch(`/api/projects/${projectId}/guide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ part: 'assets', mode: 'update' }) });
    const j = await r.json().catch(() => ({}));
    setBusy('');
    setMsg(r.ok ? `Assets imported${j.colours ? ` · ${j.colours} colours` : ''}. Packages are on the Resources tab.` : j.error || 'The import didn’t finish. Try again in a minute; Figma is sometimes busy.');
    router.refresh();
  }
  const sub = row ? [row.file, row.pageName ? `${row.pageName} page` : '', row.importedAt ? `imported ${ago(row.importedAt)}` : 'not imported yet'].filter(Boolean).join(' · ')
    : part === 'assets' && fallback ? 'Uses the guidelines file’s Assets page' : 'No link yet';
  return <div className={'ov-link fs' + (row ? '' : ' off')}>
    <span className="ov-thumb">{thumb && row ? <img src={thumb} alt="" /> : <Ic size={20} strokeWidth={1.5} aria-hidden />}</span>
    <span className="fs-top"><span className="ov-link-t">
      <b><Figma size={13} strokeWidth={1.75} aria-hidden />{label}</b>
      {editing ? <span className="fs-edit">
        <input className="in" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} placeholder={`Figma link to the ${part === 'assets' ? 'Assets' : 'Guidelines'} page`} aria-label={`${label} Figma link`} />
        <button className="btn solid" disabled={busy === 'save'} onClick={save}>{busy === 'save' ? 'Checking…' : 'Save'}</button>
        <button className="btn" onClick={() => { setEditing(false); setUrl(row?.url || ''); }}>Cancel</button>
      </span> : <span className="mute">{sub}</span>}
      {msg ? <span className="fs-msg" role="status">{msg}</span> : null}
    </span></span>
    {!editing ? <span className="fs-acts">
      {row ? <a className="btn ic sm" href={row.url} target="_blank" rel="noopener" aria-label={`Open the ${label.toLowerCase()} file in Figma`} data-tip="Open in Figma"><ArrowUpRight {...I} /></a> : null}
      <button className="btn ic sm" onClick={() => setEditing(true)} aria-label={row ? `Change the ${label.toLowerCase()} link` : `Add the ${label.toLowerCase()} link`} data-tip={row ? 'Change link' : 'Add link'}>{row ? <PenLine {...I} /> : <Link2 {...I} />}</button>
      {using ? part === 'assets'
        ? <button className="btn ic sm solid" disabled={busy === 'import'} onClick={importAssets}>{busy === 'import' ? <Loader2 {...I} className="spin" /> : <Download {...I} />}Import assets</button>
        : <a className="btn ic sm solid" href="?tab=guidelines&import=1"><Download {...I} />Choose chapters to import</a> : null}
    </span> : null}
  </div>;
}
