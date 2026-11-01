'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Package } from '@/lib/portal/packages';
import { PackagePreview } from '@/components/portal/ResourceVisuals';

type Colour = { name: string; hex: string; role?: string };
const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

// The studio side of Resources. Logos, colours, fonts and social avatars have a place in every portal; icons,
// images and graphic language are spaces to switch on; custom packages hold anything unique to the brand.
// The client only sees packages with something in them.
export function ResourceManager({ projectId, slug, packages, colours, logoUrl }: { projectId: string; slug: string; packages: Package[]; colours: Colour[]; logoUrl: string | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newPurpose, setNewPurpose] = useState('');
  const call = async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/projects/${projectId}/packages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Something went wrong.');
    return j;
  };
  async function upload(pkg: string, files: FileList | null, cover = false) {
    if (!files?.length) return;
    try {
      for (const [k, f] of [...files].entries()) {
        setMsg(`Uploading ${k + 1} of ${files.length}: ${f.name}`);
        const s = await call({ action: 'sign', pkg, name: f.name, cover });
        const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', f);
        const up = await fetch(s.signedUrl, { method: 'PUT', body: fd, headers: { 'x-upsert': 'true' } });
        if (!up.ok) throw new Error(`Couldn’t upload ${f.name}.`);
        await call({ action: 'add', pkg, name: f.name, path: s.path, bytes: f.size, type: f.type || 'application/octet-stream', cover });
      }
      setMsg('Uploaded.'); router.refresh();
    } catch (e) { setMsg((e as Error).message); }
  }
  const act = async (body: Record<string, unknown>, done = 'Saved.') => { try { await call(body); setMsg(done); router.refresh(); } catch (e) { setMsg((e as Error).message); } };

  const row = (p: Package) => {
    const live = !p.hidden && !p.empty && p.enabled;
    return (
      <div key={p.id} className={'rm-row' + (p.enabled ? '' : ' off')}>
        <div className="rm-pv"><PackagePreview p={p} colours={colours} logoUrl={logoUrl} /></div>
        <div className="rm-body">
          <div className="rm-top">
            <label className="sr" htmlFor={`t-${p.id}`}>Name</label>
            <input id={`t-${p.id}`} className="in rm-title" defaultValue={p.title} onBlur={(e) => e.target.value !== p.title && act({ action: 'patch', pkg: p.id, title: e.target.value })} />
            <span className={'tag' + (live ? ' live' : '')}>{!p.enabled ? 'Switched off' : p.hidden ? 'Hidden' : p.empty ? 'Empty: not shown to the client' : 'Shown to the client'}</span>
          </div>
          <label className="sr" htmlFor={`p-${p.id}`}>What it’s for</label>
          <input id={`p-${p.id}`} className="in" defaultValue={p.purpose} placeholder="What it’s for, in one line" onBlur={(e) => e.target.value !== p.purpose && act({ action: 'patch', pkg: p.id, purpose: e.target.value })} />
          <p className="mute rm-src">{[p.kitFiles.length ? `${p.kitFiles.length} from the kit` : '', p.uploads.length ? `${p.uploads.length} uploaded` : '', p.kind === 'colours' ? `${colours.length} colours from the guidelines, as ASE, CSS, JSON and text` : '', p.kind === 'avatars' && !p.uploads.length && !p.empty ? 'Made from the logo on three brand colours until you upload your own' : '', p.kind === 'fonts' && !p.kitFiles.length ? 'Licensed font files appear here once they’re added in Typefaces and the kit is rebuilt' : ''].filter(Boolean).join(' · ') || 'Nothing yet.'}</p>
          {p.uploads.length ? <div className="rm-files">{p.uploads.map((u) => <span key={u.name} className="rm-file">{u.name}<span className="mute">{size(u.bytes)}</span><button aria-label={`Remove ${u.name}`} onClick={() => confirm(`Remove ${u.name}?`) && act({ action: 'remove-file', pkg: p.id, name: u.name }, 'Removed.')}>×</button></span>)}</div> : null}
          <div className="row">
            {p.kind !== 'colours' && !['tokens', 'guidelines', 'templates', 'team'].includes(p.kind) ? <label className="btn">Upload files<input type="file" multiple hidden onChange={(e) => { upload(p.id, e.target.files); e.target.value = ''; }} /></label> : null}
            <label className="btn">{p.cover ? 'Replace cover' : 'Cover image'}<input type="file" accept="image/*" hidden onChange={(e) => { upload(p.id, e.target.files, true); e.target.value = ''; }} /></label>
            {p.cover ? <button className="btn" onClick={() => act({ action: 'remove-cover', pkg: p.id })}>Remove cover</button> : null}
            {p.drafted ? <button className="btn" onClick={() => act({ action: 'patch', pkg: p.id, enabled: !p.enabled })}>{p.enabled ? 'Switch off' : 'Switch on'}</button> : null}
            {p.enabled && !p.drafted ? <button className="btn" onClick={() => act({ action: 'patch', pkg: p.id, hidden: !p.hidden })}>{p.hidden ? 'Show to the client' : 'Hide from the client'}</button> : null}
            {p.custom ? <button className="btn" onClick={() => confirm(`Delete the ${p.title} package and its files?`) && act({ action: 'remove-package', pkg: p.id }, 'Deleted.')}>Delete package</button> : null}
          </div>
        </div>
      </div>
    );
  };

  const group = (title: string, blurb: string, list: Package[], extra?: React.ReactNode) => (
    <section className="card rm-sec">
      <div><h2>{title}</h2><p className="mute">{blurb}</p></div>
      {list.map(row)}
      {extra}
    </section>
  );

  return (
    <div className="rm">
      <div className="row"><a className="btn" href={`/p/${slug}/resources`} target="_blank" rel="noopener">Preview Resources as the client ↗</a><span className="mute" role="status">{msg}</span></div>
      {group('In every portal', 'Logos, colours, fonts and social avatars. They fill from the kit and the guidelines; add or replace files here.', packages.filter((p) => p.core))}
      {group('Spaces to switch on', 'For brands that have them. A space switches on when you upload to it, and stays out of the client’s view while it’s empty.', packages.filter((p) => p.drafted))}
      {group('Custom packages', 'Anything unique to this brand, with its own name, purpose and visual. For example a set of characters, textures or sounds.', packages.filter((p) => p.custom),
        <form className="rm-new" onSubmit={(e) => { e.preventDefault(); if (!newTitle.trim()) return; act({ action: 'custom', title: newTitle.trim(), purpose: newPurpose.trim() }, 'Package added. Upload its files.'); setNewTitle(''); setNewPurpose(''); }}>
          <label className="sr" htmlFor="rm-nt">Package name</label><input id="rm-nt" className="in" placeholder="Name, e.g. Creatures" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <label className="sr" htmlFor="rm-np">What it’s for</label><input id="rm-np" className="in" placeholder="What it’s for" value={newPurpose} onChange={(e) => setNewPurpose(e.target.value)} />
          <button className="btn solid" disabled={!newTitle.trim()}>+ Add package</button>
        </form>)}
      {group('From the kit', 'Built with the kit. Shown when their part of the brief is Ready (set that on Deliverables).', packages.filter((p) => ['tokens', 'guidelines', 'templates'].includes(p.kind)))}
    </div>
  );
}
