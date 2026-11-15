'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Search, Trash2 } from 'lucide-react';
import { AppIcon } from '@/components/portal/AppIcon';
import { DirectorApp } from '@/components/director/DirectorApp';
import { api as directorApi, type Tile } from '@/components/director/api';
import type { BrandKit } from '@/lib/director/model';

// Portal v2 Director: Projects first. A project holds a set of videos (a launch film, its cutdowns, the website
// loop…). Inside a project, the videos open in Director's storyboard and editor, as before.
type Project = { id: string; title: string; data: { videos?: string[] }; updated_at: string };
const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
const ago = (iso: string) => { const m = (Date.now() - new Date(iso).getTime()) / 60000; return m < 60 ? `${Math.max(1, Math.round(m))}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };

function api(slug: string) {
  const base = `/api/p/${slug}/apps/director`;
  const j = async (r: Response) => { const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error || 'Something went wrong'); return x; };
  return {
    list: () => fetch(base, { cache: 'no-store' }).then(j) as Promise<{ files: Project[]; error?: string }>,
    create: (title: string, videos: string[] = []) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, data: { videos } }) }).then(j) as Promise<{ id: string }>,
    save: (id: string, body: { title?: string; data?: Project['data'] }) => fetch(`${base}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j),
    remove: (id: string) => fetch(`${base}/${id}`, { method: 'DELETE' }).then(j)
  };
}

export function DirectorProjects({ slug, kit, canGenerate, badge, labs }: { slug: string; kit: BrandKit; canGenerate: boolean; badge: string | null; labs: boolean }) {
  const A = useMemo(() => api(slug), [slug]);
  const D = useMemo(() => directorApi(slug), [slug]);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [videos, setVideos] = useState<Tile[]>([]);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const refresh = useCallback(() => {
    A.list().then((r) => { setProjects(r.files); setErr(r.error || ''); }).catch((e) => setErr(e.message));
    D.list().then((r) => setVideos(r.files)).catch(() => {});
  }, [A, D]);
  useEffect(() => { refresh(); }, [refresh]);
  // The open project follows the address (?p=…); a video inside it adds &f=…, which Director handles
  useEffect(() => { const read = () => setOpenId(new URLSearchParams(location.search).get('p')); read(); addEventListener('popstate', read); return () => removeEventListener('popstate', read); }, []);
  const open = (id: string | null) => { setOpenId(id); history.pushState({}, '', id ? `?p=${id}` : location.pathname); if (!id) refresh(); };

  const filed = new Set((projects || []).flatMap((p) => p.data.videos || []));
  const loose = videos.filter((v) => !filed.has(v.id));
  const project = projects?.find((p) => p.id === openId);

  if (openId && project) {
    const ids = project.data.videos || [];
    const add = (id: string) => { const next = { ...project, data: { ...project.data, videos: [...ids, id] } }; setProjects((ps) => (ps || []).map((p) => (p.id === project.id ? next : p))); A.save(project.id, { data: next.data }).catch(() => {}); };
    const rename = (title: string) => { setProjects((ps) => (ps || []).map((p) => (p.id === project.id ? { ...p, title } : p))); A.save(project.id, { title: title.trim() || 'Untitled project' }).catch(() => {}); };
    return <div className="dp2">
      <header className="w2-top">
        <button className="w2-ic" onClick={() => open(null)} aria-label="Back to Projects" title="Back to Projects"><ArrowLeft {...I} /></button>
        <AppIcon app="director" size={18} play /><button className="w2-crumb" onClick={() => open(null)}>Director</button><span className="mute">/</span>
        <input className="w2-title" defaultValue={project.title} onBlur={(e) => rename(e.target.value)} aria-label="Project name" />
        <span className="mute">{ids.length} video{ids.length === 1 ? '' : 's'}</span>
      </header>
      <div className="dp2-body">
        <DirectorApp slug={slug} kit={kit} canGenerate={canGenerate} badge={badge} labs={labs} only={ids} onCreated={add}
          head={<div className="dp2-head"><h1>Videos</h1><p className="mute">Every video in {project.title}. New ones you start here join the project.</p></div>} />
        {loose.length ? <section className="dp2-loose"><h2 className="mute">Videos not in a project yet</h2><div className="dp2-loose-l">{loose.map((v) => <button key={v.id} className="btn sm" onClick={() => add(v.id)}><Plus size={12} aria-hidden />{v.title}</button>)}</div></section> : null}
      </div>
    </div>;
  }

  const create = async () => { try { const { id } = await A.create('Untitled project'); await refresh(); open(id); } catch (e) { setErr((e as Error).message); } };
  const byId = new Map(videos.map((v) => [v.id, v]));
  const list = (projects || []).filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase()));
  return <div className="fb">
    <header className="fb-top">
      <AppIcon app="director" size={18} play /><strong>Director</strong><span className="mute">/</span><span>Projects</span>
      <span className="fb-sp" />
      <label className="fb-search"><Search {...I} /><span className="sr">Search projects</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" /></label>
      <button className="btn solid" onClick={create}><Plus {...I} />New project</button>
    </header>
    <div className="fb-body">
      <div className="fb-bar"><h1>Projects</h1><span className="mute">{projects ? `${projects.length} project${projects.length === 1 ? '' : 's'}` : ''}</span></div>
      {labs ? <p className="dr-labs" role="status">Labs: only the studio can see Director.</p> : null}
      {err ? <p className="cd-err" role="alert">{err}</p> : null}
      <div className="fb-grid">
        <button className="fb-card fb-new" onClick={create}><span className="fb-th"><Plus size={20} strokeWidth={1.5} aria-hidden /><span>New project</span></span><span className="fb-name">New project</span><span className="fb-meta mute">A folder for related videos</span></button>
        {projects === null ? <div className="fb-card" aria-busy><span className="fb-th" /></div> : list.map((p) => {
          const vs = (p.data.videos || []).map((id) => byId.get(id)).filter(Boolean) as Tile[];
          return <div key={p.id} className="fb-card">
            <button className="fb-open" onClick={() => open(p.id)} aria-label={`Open ${p.title}`}>
              <span className="fb-th"><span className="fb-film">{vs.length ? vs.slice(0, 5).map((v) => v.thumbUrl ? (v.thumbKind === 'video' ? <video key={v.id} src={v.thumbUrl + '#t=0.5'} muted playsInline preload="metadata" /> : <img key={v.id} src={v.thumbUrl} alt="" />) : <i key={v.id} style={v.cover ? { background: v.cover } : undefined} />) : <i />}</span></span>
              <span className="fb-name">{p.title}</span>
              <span className="fb-meta mute">{vs.length} video{vs.length === 1 ? '' : 's'} · {ago(p.updated_at)}</span>
            </button>
            <button className="fb-del" onClick={async () => { if (!confirm(`Delete the project “${p.title}”? Its videos stay in Director.`)) return; await A.remove(p.id).catch(() => {}); refresh(); }} aria-label={`Delete ${p.title}`} title="Delete"><Trash2 size={14} strokeWidth={1.6} aria-hidden /></button>
          </div>;
        })}
      </div>
      {loose.length ? <section className="dp2-loose"><h2 className="mute">Videos not in a project yet · {loose.length}</h2><p className="mute">Made before projects existed. Start a project from them, or add them to one from inside it.</p>
        <button className="btn" onClick={async () => { try { const { id } = await A.create('Earlier videos', loose.map((v) => v.id)); await refresh(); open(id); } catch (e) { setErr((e as Error).message); } }}><Plus {...I} />Put them in a project</button></section> : null}
    </div>
  </div>;
}
