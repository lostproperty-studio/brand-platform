'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Download, Eye, EyeOff, FolderUp, ImagePlus, Loader2, Plus, RotateCw, Trash2, Upload, X } from 'lucide-react';
import type { Package } from '@/lib/portal/packages';
import type { RefreshReport } from '@/lib/portal/packageReport';
import { PackagePreview, SystemPreview } from '@/components/portal/ResourceVisuals';

type Colour = { name: string; hex: string; role?: string };
type Stamp = { refreshedAt?: string; refreshedRev?: number };
const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;
const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const ago = (iso?: string) => {
  if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
/** In every portal */
const ALWAYS = ['logos', 'colours', 'fonts'];
/** Added when the brand has them */
const OPTIONAL = ['avatars', 'icons', 'images', 'graphics'];
const FOLDERS = ['logos', 'icons', 'images', 'graphics', 'avatars', 'custom', 'fonts'];
/** What each kind of package fills from, in a line */
const SOURCE: Record<string, string> = {
  logos: 'From the Figma assets page and uploads', colours: 'Made from the guidelines’ colours', fonts: 'Licensed files from Typefaces',
  avatars: 'Made from the logo, or your uploads', icons: 'From Figma and uploads', images: 'Approved images you upload', graphics: 'From Figma and uploads',
  tokens: 'Made from the guidelines', guidelines: 'Written from the guidelines', templates: 'From the kit', team: 'Shared by the client’s team', custom: 'Your uploads'
};

// Downloads in the studio: every package as the client sees it, with whether it's showing, whether it's caught up with
// the guidelines, and a refresh. Open one to edit it, manage its files, preview it and download what the client gets.
export function ResourceManager({ projectId, slug, packages, colours, logoUrl, client, roles, guideRev = 0, ai = {} }: {
  roles: Parameters<typeof SystemPreview>[0]['roles'];
  projectId: string; slug: string; packages: Package[]; colours: Colour[]; logoUrl: string | null; client: string;
  /** The guidelines' revision now, to tell which packages are behind */ guideRev?: number;
  /** Refresh stamps for the AI deliverables */ ai?: Record<string, Stamp>;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stamps, setStamps] = useState<Record<string, Stamp>>(() => ({ ...ai, ...Object.fromEntries(packages.map((p) => [p.id, { refreshedAt: p.refreshedAt, refreshedRev: p.refreshedRev }])) }));
  const [report, setReport] = useState<(RefreshReport & { pkg: string; last?: string; at: string }) | null>(null);
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [newTitle, setNewTitle] = useState(''), [newPurpose, setNewPurpose] = useState('');
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(null); setReport(null); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);

  const call = async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/projects/${projectId}/packages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Something went wrong.');
    return j;
  };
  const act = async (body: Record<string, unknown>, done = 'Saved.') => { try { await call(body); setMsg(done); router.refresh(); } catch (e) { setMsg((e as Error).message); } };
  async function upload(pkg: string, files: FileList | File[] | null, cover = false) {
    // Folders bring their hidden files too (.DS_Store and the like): leave those out
    const list = [...(files || [])].filter((f) => !f.name.startsWith('.') && f.size > 0);
    if (!list.length) return;
    try {
      for (const [k, f] of list.entries()) {
        setMsg(`Uploading ${k + 1} of ${list.length}: ${f.name}`);
        const s = await call({ action: 'sign', pkg, name: f.name, cover });
        const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', f);
        const up = await fetch(s.signedUrl, { method: 'PUT', body: fd, headers: { 'x-upsert': 'true' } });
        if (!up.ok) throw new Error(`Couldn’t upload ${f.name}.`);
        await call({ action: 'add', pkg, name: f.name, path: s.path, bytes: f.size, type: f.type || 'application/octet-stream', cover });
      }
      setMsg(`Uploaded ${list.length} file${list.length === 1 ? '' : 's'}.`); router.refresh();
    } catch (e) { setMsg((e as Error).message); }
  }
  async function refresh(pkg: string) {
    setBusy(pkg); setMsg(pkg === 'design-system' ? 'Reading the guidelines again. This takes a minute or so…' : 'Refreshing…');
    try { const j = await call({ action: 'refresh', pkg }); setStamps((s) => ({ ...s, [pkg]: { refreshedAt: j.refreshedAt, refreshedRev: guideRev } })); if (j.report) setReport({ ...j.report, pkg, at: j.refreshedAt }); else setMsg(j.did || 'Refreshed.'); router.refresh(); }
    catch (e) { setMsg((e as Error).message); }
    setBusy(null); setMsg((m) => (/^Reading the guidelines|^Refreshing/.test(m) ? '' : m));
  }

  /** Caught up with the guidelines? */
  const fresh = (id: string) => { const st = stamps[id]; return !st?.refreshedAt ? 'never' : (st.refreshedRev ?? 0) < guideRev ? 'behind' : 'ok'; };
  const status = (p: Package) => !p.enabled ? { t: 'Not added', c: 'off' } : p.hidden ? { t: 'Hidden', c: 'off' } : p.empty ? { t: 'Empty, so not shown', c: 'off' } : !p.ready ? { t: 'Waiting on the kit', c: 'warn' } : { t: 'Shown to the client', c: 'live' };
  const freshLine = (id: string) => { const f = fresh(id); return <span className={'rm2-fresh ' + f}>{busy === id ? 'Refreshing…' : f === 'never' ? 'Not refreshed yet' : f === 'behind' ? 'Guidelines changed since the last refresh' : `Up to date · ${ago(stamps[id]?.refreshedAt)}`}</span>; };
  const refreshBtn = (id: string, label = 'Refresh') => <button type="button" className="rm2-ic" onClick={(e) => { e.stopPropagation(); refresh(id); }} disabled={!!busy} aria-label={`${label}: bring it up to date with the guidelines`} data-tip="Refresh from the guidelines">{busy === id ? <Loader2 {...I} className="spin" /> : <RotateCw {...I} />}</button>;

  const card = (p: Package) => { const s = status(p); return (
    <article key={p.id} className={'rm2-card' + (s.c === 'off' ? ' dim' : '')} onClick={() => setOpen(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(p.id); }} tabIndex={0} role="button" aria-label={`${p.title}: open`}>
      <div className="rm2-pv"><PackagePreview p={p} colours={colours} logoUrl={logoUrl} /></div>
      <div className="rm2-txt">
        <div className="rm2-top"><h3>{p.title}</h3>{refreshBtn(p.id)}</div>
        <p className="rm2-meta"><span className={'rm2-dot ' + s.c} aria-hidden />{s.t}{p.count ? ` · ${p.count} file${p.count === 1 ? '' : 's'}` : ''}</p>
        {freshLine(p.id)}
      </div>
    </article>
  ); };

  const aiCard = (id: 'design-system' | 'skills', title: string, sub: string, href: string) => (
    <article key={id} className="rm2-card ai">
      <div className="rm2-pv">{id === 'design-system' ? <div className="rs-pv rs-dspv"><SystemPreview colours={colours} logoUrl={logoUrl} client={client} roles={roles} /></div> : <div className="rs-pv rm2-skills"><span>Claude</span><b>skills</b></div>}</div>
      <div className="rm2-txt">
        <div className="rm2-top"><h3>{title}</h3>{refreshBtn(id, title)}</div>
        <p className="rm2-meta"><span className="rm2-dot live" aria-hidden />{sub}</p>
        {freshLine(id)}
        <a className="rm2-link" href={href} download onClick={(e) => e.stopPropagation()}><Download {...I} />Download what the client gets</a>
      </div>
    </article>
  );

  const cur = packages.find((p) => p.id === open);
  const isOn = (p: Package) => ALWAYS.includes(p.kind) || (p.custom ? true : p.drafted ? p.enabled : OPTIONAL.includes(p.kind) ? !p.hidden : false);
  const group = (title: string, blurb: string, list: Package[], extra?: React.ReactNode) => list.length || extra ? <section className="rm2-sec">
    <div className="rm2-sec-h"><h2>{title}</h2><p className="mute">{blurb}</p></div>
    <div className="rm2-grid">{list.map(card)}{extra}</div>
  </section> : null;

  return (
    <div className="rm2">
      <div className="rm2-bar">
        <p className="mute">Click a package to edit it, change its files or preview it. Refresh brings it up to date with the guidelines as they are now.</p>
        <a className="btn" href={`/p/${slug}/resources`} target="_blank" rel="noopener"><Eye {...I} />See Resources as the client</a>
      </div>
      {msg ? <p className="rm2-msg" role="status">{msg}<button type="button" onClick={() => setMsg('')} aria-label="Dismiss"><X {...I} /></button></p> : null}

      <section className="rm2-sec">
        <div className="rm2-sec-h"><h2>Brand assets</h2><p className="mute">Logo, colour and type are in every portal. Add the others when the brand has them; remove any it doesn’t need.</p></div>
        <div className="rm2-grid">
          {packages.filter(isOn).map(card)}
          {adding ? <form className="rm2-card rm2-new" onSubmit={(e) => { e.preventDefault(); if (!newTitle.trim()) return; act({ action: 'custom', title: newTitle.trim(), purpose: newPurpose.trim() }, 'Package added. Open it to upload its files.'); setNewTitle(''); setNewPurpose(''); setAdding(false); }}>
            <input className="in" autoFocus placeholder="Name, e.g. Textures" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} aria-label="Package name" />
            <input className="in" placeholder="What it’s for" value={newPurpose} onChange={(e) => setNewPurpose(e.target.value)} aria-label="What it’s for" />
            <div className="row"><button className="btn solid" disabled={!newTitle.trim()}>Add</button><button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button></div>
          </form> : <div className="rm2-addwrap">
            <button type="button" className="rm2-card rm2-add" onClick={() => setPicking(!picking)} aria-expanded={picking}><Plus size={18} strokeWidth={1.75} aria-hidden />Add a package</button>
            {picking ? <div className="rm2-menu" role="menu">
              {packages.filter((p) => OPTIONAL.includes(p.kind) && !isOn(p)).map((p) => <button key={p.id} type="button" role="menuitem" onClick={() => { setPicking(false); act(p.drafted ? { action: 'patch', pkg: p.id, enabled: true } : { action: 'patch', pkg: p.id, hidden: false }, `${p.title} added. Open it to add its files.`); }}><b>{p.title}</b><span>{p.purpose}</span></button>)}
              <button type="button" role="menuitem" onClick={() => { setPicking(false); setAdding(true); }}><b>Something else</b><span>A package of your own, e.g. textures or motion files</span></button>
            </div> : null}
          </div>}
        </div>
      </section>
      <section className="rm2-sec">
        <div className="rm2-sec-h"><h2>For AI</h2><p className="mute">The brand for Claude. Refresh after the guidelines change so it’s read them again.</p></div>
        <div className="rm2-grid">
          {aiCard('design-system', 'Design system', 'Read from the guidelines by AI', `/api/p/${slug}/design-system`)}
          {aiCard('skills', 'Claude skills', 'Written from the published guidelines', `/p/${slug}/resources#ai`)}
        </div>
      </section>
      {group('For developers', 'Built from the kit and the guidelines.', packages.filter((p) => ['tokens', 'guidelines', 'templates'].includes(p.kind)))}

      {report ? <div className="rm2-back rm2-center" onMouseDown={(e) => { if (e.target === e.currentTarget) setReport(null); }}>
        <div className="rm2-rep" role="dialog" aria-modal="true" aria-labelledby="rep-t">
          <div className="rm2-rep-h"><span className="rm2-rep-ok"><Check size={16} strokeWidth={2.5} aria-hidden /></span><div><h2 id="rep-t">{report.title} is up to date</h2><p className="mute">Refreshed {new Date(report.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{report.last ? ` · last time ${ago(report.last)}` : ' · first refresh'}</p></div><button type="button" className="rm2-ic" onClick={() => setReport(null)} aria-label="Close"><X {...I} /></button></div>
          <p className="rm2-rep-sum">{report.summary}</p>
          <section><h3>{report.last ? 'What’s changed since last time' : 'What it did'}</h3>
            {report.changes.length ? <ul className="rm2-rep-ch">{report.changes.map((c, i) => <li key={i}>{c}</li>)}</ul> : <p className="mute">Nothing changed. What the client gets is the same as before.</p>}
          </section>
          {report.previews?.length ? <div className="rm2-thumbs">{report.previews.map((u) => <img key={u} src={u} alt="" />)}</div> : null}
          {report.designMd ? <section><h3>Preview: what Claude reads</h3><pre className="rm2-rep-md">{report.designMd}</pre></section> : null}
          {report.contents.length ? <section><h3>In the package <span className="mute">· {report.contents.length} file{report.contents.length === 1 ? '' : 's'}</span></h3>
            <ul className="rm2-list rm2-rep-files">{report.contents.slice(0, 60).map((f) => <li key={f.name}><span>{f.name}</span><span className="mute">{f.from}{f.bytes ? ` · ${size(f.bytes)}` : ''}</span></li>)}{report.contents.length > 60 ? <li className="mute">and {report.contents.length - 60} more</li> : null}</ul>
          </section> : null}
          <div className="rm2-pane-f"><span style={{ flex: 1 }} /><button className="btn" onClick={() => setReport(null)}>Close</button><a className="btn solid" href={report.pkg === 'design-system' ? `/api/p/${slug}/design-system` : report.pkg === 'skills' ? `/p/${slug}/resources#ai` : `/api/p/${slug}/package/${report.pkg}`} download><Download {...I} />Download as the client gets it</a></div>
        </div>
      </div> : null}
      {cur ? <div className="rm2-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
        <aside className="rm2-pane" role="dialog" aria-modal="true" aria-label={cur.title}>
          <div className="rm2-pane-h"><strong>{cur.title}</strong><button type="button" className="rm2-ic" onClick={() => setOpen(null)} aria-label="Close"><X {...I} /></button></div>
          <div className="rm2-pane-b">
            <div className="rm2-pane-pv"><PackagePreview p={cur} colours={colours} logoUrl={logoUrl} /></div>
            <div className="rm2-row">
              <span className={'rm2-dot ' + status(cur).c} aria-hidden /><span>{status(cur).t}</span><span style={{ flex: 1 }} />
              {OPTIONAL.includes(cur.kind) ? <button className="btn" onClick={() => { act(cur.drafted ? { action: 'patch', pkg: cur.id, enabled: false } : { action: 'patch', pkg: cur.id, hidden: true }, `${cur.title} removed from the portal. Its files are kept; add it again any time.`); setOpen(null); }}><Trash2 {...I} />Remove from the portal</button>
                : <button className="btn" onClick={() => act({ action: 'patch', pkg: cur.id, hidden: !cur.hidden })}>{cur.hidden ? <><Eye {...I} />Show to the client</> : <><EyeOff {...I} />Hide from the client</>}</button>}
            </div>
            <label className="rm2-f"><span>Name</span><input className="in" defaultValue={cur.title} key={cur.id + 't'} onBlur={(e) => e.target.value.trim() && e.target.value !== cur.title && act({ action: 'patch', pkg: cur.id, title: e.target.value.trim() })} /></label>
            <label className="rm2-f"><span>What it’s for</span><input className="in" defaultValue={cur.purpose} key={cur.id + 'p'} placeholder="One line for the client" onBlur={(e) => e.target.value !== cur.purpose && act({ action: 'patch', pkg: cur.id, purpose: e.target.value })} /></label>
            {cur.kind === 'images' ? <>
              <label className="rm2-f"><span>Who owns them</span><input className="in" defaultValue={cur.owner || ''} key={cur.id + 'o'} placeholder={`e.g. Owned by ${client}, licensed from Unsplash+ until 2027`} onBlur={(e) => e.target.value !== (cur.owner || '') && act({ action: 'patch', pkg: cur.id, owner: e.target.value })} /><small className="mute">Shown with the approved library in the imagery chapter and on Resources.</small></label>
              <label className="rm2-f"><span>Note at the top of the imagery chapter</span><textarea className="in" rows={3} defaultValue={cur.note || ''} key={cur.id + 'n'} placeholder={`The pictures in this chapter show the look and feel to aim for. Many are reference images ${client} doesn’t hold the rights to, so please don’t copy, download or reuse them.`} onBlur={(e) => e.target.value !== (cur.note || '') && act({ action: 'patch', pkg: cur.id, note: e.target.value })} /><small className="mute">Leave empty to use the wording shown.</small></label>
            </> : null}

            <div className="rm2-files-h"><strong>Files</strong><span className="mute">{SOURCE[cur.kind] || ''}</span></div>
            {cur.kind !== 'colours' && !['tokens', 'guidelines', 'templates', 'team'].includes(cur.kind) ? <div className="rm2-drop" onDragOver={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add('on'); }} onDragLeave={(e) => (e.currentTarget as HTMLElement).classList.remove('on')} onDrop={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.remove('on'); upload(cur.id, e.dataTransfer.files); }}>
              <span className="mute">Drop files here, or</span>
              <label className="btn"><Upload {...I} />Choose files<input type="file" multiple hidden onChange={(e) => { upload(cur.id, e.target.files); e.target.value = ''; }} /></label>
              {FOLDERS.includes(cur.kind) ? <label className="btn"><FolderUp {...I} />Upload a folder<input type="file" multiple hidden {...{ webkitdirectory: '', directory: '' }} onChange={(e) => { upload(cur.id, e.target.files); e.target.value = ''; }} /></label> : null}
            </div> : null}
            {cur.images.length ? <div className="rm2-thumbs">{cur.images.map((im) => <img key={im.url} src={im.url} alt={im.name} title={im.name} />)}</div> : null}
            <ul className="rm2-list">
              {cur.uploads.map((u) => <li key={u.name}><span>{u.name}</span><span className="mute">{u.fromFigma ? 'Figma · ' : ''}{size(u.bytes)}</span>
                <a className="rm2-ic" href={`/api/p/${slug}/package/${cur.id}?file=${encodeURIComponent(u.path)}`} aria-label={`Download ${u.name}`}><Download {...I} /></a>
                <button type="button" className="rm2-ic" onClick={() => confirm(`Remove ${u.name}?`) && act({ action: 'remove-file', pkg: cur.id, name: u.name }, 'Removed.')} aria-label={`Remove ${u.name}`}><Trash2 {...I} /></button></li>)}
              {cur.kitFiles.slice(0, 40).map((f) => <li key={f.path}><span>{f.path.split('/').pop()}</span><span className="mute">From the kit</span></li>)}
              {cur.kitFiles.length > 40 ? <li className="mute">and {cur.kitFiles.length - 40} more from the kit</li> : null}
              {cur.kind === 'colours' ? <li className="mute">{colours.length} colours as ASE, CSS, JSON and text, made when downloaded</li> : null}
              {!cur.uploads.length && !cur.kitFiles.length && cur.kind !== 'colours' ? <li className="mute">No files yet.</li> : null}
            </ul>
            <div className="rm2-row">
              <label className="btn"><ImagePlus {...I} />{cur.cover ? 'Replace the cover' : 'Add a cover'}<input type="file" accept="image/*" hidden onChange={(e) => { upload(cur.id, e.target.files, true); e.target.value = ''; }} /></label>
              {cur.cover ? <button className="btn" onClick={() => act({ action: 'remove-cover', pkg: cur.id })}>Remove the cover</button> : null}
            </div>
          </div>
          <div className="rm2-pane-f">
            {cur.custom ? <button className="btn" onClick={() => { if (confirm(`Delete the ${cur.title} package and its files?`)) { act({ action: 'remove-package', pkg: cur.id }, 'Deleted.'); setOpen(null); } }}><Trash2 {...I} />Delete</button> : null}
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={() => refresh(cur.id)} disabled={!!busy}>{busy === cur.id ? <Loader2 {...I} className="spin" /> : <RotateCw {...I} />}Refresh</button>
            {!cur.empty ? <a className="btn solid" href={`/api/p/${slug}/package/${cur.id}`} download><Download {...I} />Download as the client gets it</a> : <span className="btn solid" aria-disabled style={{ opacity: .4 }}><Check {...I} />Nothing to download yet</span>}
          </div>
        </aside>
      </div> : null}
    </div>
  );
}
