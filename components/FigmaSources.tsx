'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ArrowUpRight, BookOpen, Check, ChevronDown, Download, ExternalLink, FilePlus2, Figma, Link2, Loader2, Package, PenLine, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { AssetsReport } from '@/lib/portal/templateBuild';

export type SourceRow = { url: string; file?: string; pageName?: string; importedAt?: string } | null;
const ago = (d: string) => { const s = (Date.now() - new Date(d).getTime()) / 1000, h = s / 3600, dd = h / 24; return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : h < 24 ? `${Math.round(h)} h ago` : dd < 7 ? `${Math.round(dd)} day${Math.round(dd) === 1 ? '' : 's'} ago` : new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;

// The two Figma links: one for the brand assets (logos, fonts, colours, the brand form), one for the guidelines.
// They can point at the same file; each is imported on its own.
export function FigmaSources({ projectId, slug, repo, assets, guidelines, thumb, report }: { projectId: string; slug?: string; repo?: string | null; assets: SourceRow; guidelines: SourceRow; thumb?: string; report?: AssetsReport | null }) {
  return <>
    <SourceLink projectId={projectId} slug={slug} repo={repo} part="assets" row={assets} fallback={guidelines} report={report} />
    <SourceLink projectId={projectId} part="guidelines" row={guidelines} thumb={thumb} />
  </>;
}

function SourceLink({ projectId, slug, repo, part, row, fallback, thumb, report }: { projectId: string; slug?: string; repo?: string | null; part: 'assets' | 'guidelines'; row: SourceRow; fallback?: SourceRow; thumb?: string; report?: AssetsReport | null }) {
  const [dialog, setDialog] = useState<null | { fresh?: { otherFile: boolean; file?: string; page?: string }; show?: AssetsReport }>(null);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(row?.url || '');
  const [busy, setBusy] = useState<'' | 'save'>('');
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
    // A new assets link changes nothing until it's imported: ask how, straight away
    if (part === 'assets' && j.changed?.assets) setDialog({ fresh: j.changed.assets });
  }
  const sub = row ? [row.file, row.pageName ? `${row.pageName} page` : '', row.importedAt ? `imported ${ago(row.importedAt)}` : 'not imported yet'].filter(Boolean).join(' · ')
    : part === 'assets' && fallback ? 'Uses the guidelines file’s Assets page' : 'No link yet';
  const total = report ? report.packages.reduce((n, p) => n + p.added.length + p.updated.length + p.unchanged, 0) : 0;
  return <div className={'ov-link fs' + (row ? '' : ' off')}>
    <span className="ov-thumb">{thumb && row ? <img src={thumb} alt="" /> : <Ic size={20} strokeWidth={1.5} aria-hidden />}</span>
    <span className="fs-top"><span className="ov-link-t">
      <b><Figma size={13} strokeWidth={1.75} aria-hidden />{label}</b>
      {editing ? <span className="fs-edit">
        <input className="in" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} placeholder={`Figma link to the ${part === 'assets' ? 'Assets' : 'Guidelines'} page`} aria-label={`${label} Figma link`} />
        <button className="btn solid" disabled={busy === 'save'} onClick={save}>{busy === 'save' ? 'Checking…' : 'Save'}</button>
        <button className="btn" onClick={() => { setEditing(false); setUrl(row?.url || ''); }}>Cancel</button>
      </span> : <span className="mute">{sub}</span>}
      {part === 'assets' && report && !editing ? <span className="fs-msg">{total} files in {report.packages.length} download{report.packages.length === 1 ? '' : 's'} · {report.colours.total} colours{report.logo ? ` · logo ${report.logo.name}` : ''}</span> : null}
      {msg ? <span className="fs-msg" role="status">{msg}</span> : null}
    </span></span>
    {!editing ? <span className="fs-acts">
      {row ? <a className="btn ic sm" href={row.url} target="_blank" rel="noopener" aria-label={`Open the ${label.toLowerCase()} file in Figma`} data-tip="Open in Figma"><ArrowUpRight {...I} /></a> : null}
      <button className="btn ic sm" onClick={() => setEditing(true)} aria-label={row ? `Change the ${label.toLowerCase()} link` : `Add the ${label.toLowerCase()} link`} data-tip={row ? 'Change link' : 'Add link'}>{row ? <PenLine {...I} /> : <Link2 {...I} />}</button>
      {using ? part === 'assets'
        ? <><button className="btn ic sm solid" onClick={() => setDialog({})}><Download {...I} />Import assets</button>{report ? <button className="btn sm" onClick={() => setDialog({ show: report })}>What changed</button> : null}</>
        : <a className="btn ic sm solid" href="?tab=guidelines&import=1"><Download {...I} />Choose chapters to import</a> : null}
    </span> : null}
    {dialog ? <AssetsDialog projectId={projectId} slug={slug} repo={repo} fresh={dialog.fresh} show={dialog.show} hasUploads={!!report?.packages.some((p) => p.uploads)} onClose={() => { setDialog(null); router.refresh(); }} /> : null}
  </div>;
}

type Mode = 'update' | 'add' | 'fresh';
const n = (x: number, w: string) => `${x} ${w}${x === 1 ? '' : 's'}`;

/** Import the brand assets: how to treat what's there, then exactly what changed and where it shows up */
function AssetsDialog({ projectId, slug, repo, fresh, show, hasUploads, onClose }: { projectId: string; slug?: string; repo?: string | null; fresh?: { otherFile: boolean; file?: string; page?: string }; show?: AssetsReport; hasUploads: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>(fresh?.otherFile ? 'fresh' : 'update');
  const [wipe, setWipe] = useState(false);
  const [toKit, setToKit] = useState(!!repo);
  const [stage, setStage] = useState('');
  const [sure, setSure] = useState(false);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState('');
  const [rep, setRep] = useState<AssetsReport | null>(show || null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !running) { e.stopPropagation(); onClose(); } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }, [onClose, running]);
  async function run() {
    setSure(false); setRunning(true); setErr(''); setStage('Exporting every asset from Figma and comparing it with what’s here…');
    const r = await fetch(`/api/projects/${projectId}/guide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ part: 'assets', mode, wipe: mode === 'fresh' && wipe }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setRunning(false); setErr(j.error || 'The import didn’t finish. Try again in a minute; Figma is sometimes busy.'); return; }
    const report = j.report as AssetsReport;
    // Then the kit: the repository's assets folder is rebuilt from the same files
    if (toKit) {
      setStage('Updating the kit repository on GitHub…');
      const k = await fetch(`/api/projects/${projectId}/kit?direct=1&reason=assets`, { method: 'POST' });
      const kj = await k.json().catch(() => ({}));
      report.kit = k.ok ? { repo: kj.repo, files: kj.assets, removed: kj.removed || 0, commit: kj.commit } : { repo: repo || '', files: 0, removed: 0, error: (kj.error || (await k.text().catch(() => '')) || `status ${k.status}`).slice(0, 200) };
    }
    setRunning(false); setRep(report);
  }
  const MODES: { id: Mode; icon: LucideIcon; title: string; body: string }[] = [
    { id: 'update', icon: RefreshCw, title: 'Sync with Figma', body: 'Adds new assets, replaces ones that changed and removes ones no longer in Figma. Files uploaded here stay.' },
    { id: 'add', icon: FilePlus2, title: 'Only add what’s new', body: 'Brings in new assets and colours; nothing already here is changed or removed.' },
    { id: 'fresh', icon: TriangleAlert, title: 'Start from scratch', body: 'Removes every asset from the last import and builds the downloads, colours, typefaces and brand form again from this file.' }
  ];
  const back = (e: React.MouseEvent) => { if (e.target === e.currentTarget && !running) onClose(); };

  if (rep) return <div className="cf-back" onMouseDown={back}><div className="cf cf-wide ar" role="dialog" aria-modal="true" aria-labelledby="ar-t">
    <h2 id="ar-t" className="cf-t">{show ? 'Last assets import' : 'Assets imported'}</h2>
    <p className="cf-b">From <b>{rep.file}</b> · {new Date(rep.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {rep.mode === 'fresh' ? 'started from scratch' : rep.mode === 'add' ? 'new assets only' : 'synced'}</p>
    <Report r={rep} />
    <p className="ar-foot">Downloads and the logo update in the portal straight away. Colours and typefaces reach the client when you next publish.</p>
    <div className="cf-row">{slug ? <a className="btn ic" href={`/p/${slug}/resources`} target="_blank" rel="noopener"><ExternalLink {...I} />Preview the downloads</a> : null}<a className="btn" href="?tab=resources">Resources tab</a><button className="btn solid" autoFocus onClick={onClose}>Done</button></div>
  </div></div>;

  if (sure) return <div className="cf-back" onMouseDown={back}><div className="cf" role="alertdialog" aria-modal="true" aria-labelledby="as-t2" aria-describedby="as-b2">
    <span className="cf-ic" aria-hidden><TriangleAlert size={18} strokeWidth={1.75} /></span>
    <h2 id="as-t2" className="cf-t">Start the assets from scratch?</h2>
    <p id="as-b2" className="cf-b">Every logo, avatar, icon, image and graphic from the last import is deleted, along with the older kit versions of them in the downloads, and the colours, typeface names and brand form are replaced by this file’s.{wipe ? ' Files uploaded here to those downloads are deleted too.' : ' Files uploaded here stay.'}{toKit ? ' The kit repository’s assets folder is rebuilt to match.' : ''} The guidelines aren’t touched. This can’t be undone.</p>
    <div className="cf-row"><button className="btn" autoFocus onClick={() => setSure(false)}>Go back</button><button className="btn solid cf-yes" onClick={run}>Yes, start from scratch</button></div>
  </div></div>;

  return <div className="cf-back" onMouseDown={back}><div className="cf cf-wide" role="dialog" aria-modal="true" aria-labelledby="as-t">
    <h2 id="as-t" className="cf-t">Import brand assets</h2>
    {fresh ? <p className="cf-b as-new"><Check {...I} /><span>New link saved{fresh.file ? <>: <b>{fresh.file}</b>{fresh.page ? ` · ${fresh.page}` : ''}</> : ''}. Nothing has changed yet.{fresh.otherFile ? ' It’s a different file from before, so starting from scratch is suggested.' : ''}</span></p> : null}
    <p className="cf-b">Builds the downloads on the Resources page (logos, avatars, icons, images, graphics) and brands the portal with this file’s logo, colours and typefaces.</p>
    {running ? <div className="as-run" role="status"><Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden />{stage} This takes a minute or two.</div> : <>
      <div className="rb-opts" role="radiogroup" aria-labelledby="as-t">
        {MODES.map(({ id, icon: Ic, title, body }) => <button key={id} role="radio" aria-checked={mode === id} className={'rb-opt' + (mode === id ? ' on' : '')} onClick={() => setMode(id)}>
          <span className="rb-ic" aria-hidden><Ic size={18} strokeWidth={1.75} /></span><span><b>{title}{id === 'fresh' && fresh?.otherFile ? <span className="as-rec">Suggested</span> : null}</b><span>{body}</span></span>
        </button>)}
      </div>
      {repo ? <label className="as-wipe"><input type="checkbox" checked={toKit} onChange={(e) => setToKit(e.target.checked)} />Also update the kit repository ({repo.split('/').pop()}): its assets folder is rebuilt from these files</label> : <p className="as-wipe mute">There’s no kit repository yet; building the kit will use these files.</p>}
      {mode === 'fresh' ? <label className="as-wipe"><input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} />Also delete files uploaded here to those downloads{hasUploads ? '' : ' (if any)'}</label> : null}
    </>}
    {err ? <p className="tm2-msg" role="alert">{err}</p> : null}
    <div className="cf-row"><button className="btn" disabled={running} onClick={onClose}>Cancel</button><button className="btn solid" disabled={running} onClick={() => (mode === 'fresh' ? setSure(true) : run())}>{running ? 'Importing…' : mode === 'fresh' ? 'Continue' : 'Import'}</button></div>
  </div></div>;
}

function Report({ r }: { r: AssetsReport }) {
  const [open, setOpen] = useState<string | null>(null);
  const names = (l: string[]) => l.slice(0, 12).join(', ') + (l.length > 12 ? ` and ${l.length - 12} more` : '');
  return <div className="ar-body">
    <section><h3>Downloads</h3>
      {r.packages.length ? <ul className="ar-list">{r.packages.map((p) => { const any = p.added.length + p.updated.length + p.removed.length + p.uploadsRemoved.length; return <li key={p.key}>
        <button className="ar-row" onClick={() => setOpen(open === p.key ? null : p.key)} aria-expanded={open === p.key} disabled={!any}>
          <span className="ar-t">{p.title}</span>
          <span className="ar-chips">{p.added.length ? <span className="ar-c add">+{p.added.length} new</span> : null}{p.updated.length ? <span className="ar-c upd">{p.updated.length} updated</span> : null}{p.removed.length ? <span className="ar-c rem">−{p.removed.length} removed</span> : null}{p.uploadsRemoved.length ? <span className="ar-c rem">−{p.uploadsRemoved.length} uploads</span> : null}{p.unchanged ? <span className="ar-c">{p.unchanged} unchanged</span> : null}{p.uploads ? <span className="ar-c">{n(p.uploads, 'upload')} kept</span> : null}</span>
          {any ? <ChevronDown size={14} strokeWidth={1.75} aria-hidden className={open === p.key ? 'ar-open' : ''} /> : <span />}
        </button>
        {open === p.key ? <div className="ar-names">{p.added.length ? <p><b>New</b> {names(p.added)}</p> : null}{p.updated.length ? <p><b>Updated</b> {names(p.updated)}</p> : null}{p.removed.length ? <p><b>Removed</b> {names(p.removed)}</p> : null}{p.uploadsRemoved.length ? <p><b>Uploads deleted</b> {names(p.uploadsRemoved)}</p> : null}</div> : null}
      </li>; })}</ul> : <p className="mute">No assets found. Assets are frames inside the Logos, Avatars, Icons, Images and Graphic language sections of the Assets page.</p>}
      {r.notes?.length ? <details className="ar-notes"><summary>{n(r.notes.length, 'note')} on how the Assets page was read</summary><ul>{r.notes.map((x, i) => <li key={i}><b>{x.name}</b> <span className="mute">({x.pkg})</span>: {x.reason}</li>)}</ul></details> : null}
      {r.failed.length ? <p className="ar-warn"><TriangleAlert size={13} strokeWidth={1.75} aria-hidden /> Figma didn’t export {names(r.failed)}. Import again to retry.</p> : null}
    </section>
    <section><h3>Kit repository</h3>
      {r.kit ? r.kit.error ? <p className="ar-warn"><TriangleAlert size={13} strokeWidth={1.75} aria-hidden /> The repository didn’t update: {r.kit.error}</p>
        : <p className="ar-p">{r.kit.repo}: {n(r.kit.files, 'asset file')} committed to the main branch{r.kit.removed ? `, ${n(r.kit.removed, 'old file')} removed` : ''}.{r.kit.commit ? <> <a href={`https://github.com/${r.kit.repo}/commit/${r.kit.commit}`} target="_blank" rel="noopener">See the commit</a></> : null}</p>
        : <p className="mute ar-p">Not updated with this import. Rebuild the kit from the Overview’s actions to put these files in it.</p>}
    </section>
    <section><h3>Portal branding</h3>
      <dl className="ar-dl">
        <dt>Logo</dt><dd>{r.logo ? <>{r.logo.name}{r.logo.light ? <span className="mute"> · on dark: {r.logo.light}</span> : null}</> : <span className="mute">None in the Logos section; the kit’s logo is used if there is one</span>}</dd>
        <dt>Colours</dt><dd>{n(r.colours.total, 'colour')}{r.colours.added.length ? <span className="ar-c add">+{r.colours.added.length}</span> : null}{r.colours.removed.length ? <span className="ar-c rem">−{r.colours.removed.length}</span> : null}{r.colours.added.length || r.colours.removed.length ? <span className="ar-sub">{r.colours.added.length ? `New: ${names(r.colours.added)}. ` : ''}{r.colours.removed.length ? `Removed: ${names(r.colours.removed)}.` : ''}</span> : null}</dd>
        <dt>Typefaces</dt><dd>{r.fonts.length ? r.fonts.map((f) => <span key={f.role} className="ar-font"><span className="mute">{f.role}</span> {f.family || '—'}{f.files ? <span className="mute"> · {n(f.files, 'file')}</span> : null}{f.note ? <span className="ar-warn-i">{f.note}</span> : null}</span>) : <span className="mute">None named on the Assets page</span>}</dd>
        <dt>Brand form</dt><dd>{n(r.form, 'answer')}{r.line ? <span className="mute"> · “{r.line}”</span> : null}</dd>
      </dl>
    </section>
  </div>;
}
