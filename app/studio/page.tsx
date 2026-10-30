import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff, userClient } from '@/lib/supabase/server';
import { ProjectCard } from '@/components/ProjectCard';
import { fontsNeedingLicence, type ProjectFont } from '@/lib/fonts';

type Row = { id: string; client: string; name: string; slug: string; status: 'draft' | 'live' | 'archived'; updated_at: string; repo_full_name: string | null; brand: { core?: { hex: string }[]; logo?: string; fonts?: ProjectFont[] } };
const FILTERS = [['all', 'All'], ['live', 'Live'], ['draft', 'Draft'], ['archived', 'Archive']] as const;

// Studio dashboard: left panel of filters and clients, grid of project cards.
export default async function Studio({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; deleted?: string; repo?: string; repoFailed?: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) redirect('/');
  const sp = await searchParams;
  const sb = await userClient();
  const { data } = await sb.from('projects').select('id, client, name, slug, status, updated_at, brand, repo_full_name').order('updated_at', { ascending: false });
  const all = (data || []) as Row[];
  const f = (sp.f || 'all') as (typeof FILTERS)[number][0];
  const q = (sp.q || '').toLowerCase();
  const list = all.filter((p) => (f === 'all' ? p.status !== 'archived' : p.status === f) && (!q || p.client.toLowerCase().includes(q)));
  const count = (k: string) => all.filter((p) => (k === 'all' ? p.status !== 'archived' : p.status === k)).length;
  return (
    <div className="db">
      <aside className="db-side">
        <div className="db-ws"><img src="/lp-logo.svg" alt="" />Lost Property</div>
        <form><label className="mute" htmlFor="q" style={{ position: 'absolute', left: -9999 }}>Search</label><input id="q" name="q" className="in" placeholder="Search..." defaultValue={sp.q} style={{ borderRadius: 8 }} /></form>
        <p className="db-h">Projects</p>
        {FILTERS.map(([k, label]) => <Link key={k} href={`/studio?f=${k}`} className={'db-it' + (f === k ? ' on' : '')}>{label}<span className="n">{count(k)}</span></Link>)}
        <p className="db-h">Clients</p>
        {all.filter((p) => p.status !== 'archived').map((p) => <Link key={p.id} href={`/studio/projects/${p.id}`} className="db-it">{p.client}<span className="n">{p.status === 'live' ? 'Live' : 'Draft'}</span></Link>)}
      </aside>
      <main className="db-main">
        <div className="db-top"><h1>{FILTERS.find(([k]) => k === f)?.[1]}</h1><Link className="btn pink" href="/studio/new">New project</Link></div>
        {sp.deleted ? <div className="card" role="status" style={{ marginBottom: 20 }}>Deleted {sp.deleted}.{sp.repo ? (sp.repoFailed ? <> The GitHub repository <a href={`https://github.com/${sp.repo}`}>{sp.repo}</a> couldn’t be deleted; remove it on GitHub if you don’t need it.</> : <> The kit is still on GitHub at <a href={`https://github.com/${sp.repo}`}>{sp.repo}</a>.</>) : null}</div> : null}
        <div className="db-grid">
          {list.map((p) => <ProjectCard key={p.id} p={{ id: p.id, client: p.client, slug: p.slug, status: p.status, updated_at: p.updated_at, repo_full_name: p.repo_full_name, thumb: p.brand?.core?.[1]?.hex || '#111', logo: p.brand?.logo, trialFonts: fontsNeedingLicence((p.brand?.fonts || []).map((f) => ({ ...f, files: f.files || [] }))).filter((f) => f.files.length).length }} />)}
        </div>
        {!list.length ? <p className="mute" style={{ padding: '40px 0' }}>No projects yet. Start one with New project.</p> : null}
      </main>
    </div>
  );
}
