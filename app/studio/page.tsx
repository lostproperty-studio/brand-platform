import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff, userClient } from '@/lib/supabase/server';
import { ProjectCard } from '@/components/ProjectCard';
import { logoThumbs } from '@/lib/projects/logoThumb';
import { RequestsInbox, type InboxReq } from '@/components/RequestsInbox';
import { Inbox, Settings } from 'lucide-react';
import { fontsNeedingLicence, type ProjectFont } from '@/lib/fonts';

type Row = { packages?: unknown; id: string; client: string; name: string; slug: string; status: 'draft' | 'live' | 'archived'; updated_at: string; repo_full_name: string | null; brand: { core?: { hex: string }[]; logo?: string; fonts?: ProjectFont[] } };
const FILTERS = [['all', 'All'], ['live', 'Live'], ['draft', 'Draft'], ['archived', 'Archive']] as const;
type View = (typeof FILTERS)[number][0] | 'requests';

// Studio dashboard: left panel of filters and clients, grid of project cards.
export default async function Studio({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; deleted?: string; repo?: string; repoFailed?: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) redirect('/');
  const sp = await searchParams;
  const sb = await userClient();
  const { data } = await sb.from('projects').select('id, client, name, slug, status, updated_at, brand, repo_full_name, packages:content->packages').order('updated_at', { ascending: false });
  const all = (data || []) as unknown as Row[];
  const thumbs = await logoThumbs(all.map((p) => ({ id: p.id, client: p.client, brand: p.brand, content: { packages: p.packages } })));
  // Client requests from every project: new and in progress first, then the 60 most recent of the rest
  const { data: reqRows } = await sb.from('requests').select('id, project_id, kind, title, details, status, reply, email, created_at').order('created_at', { ascending: false }).limit(200);
  const reqs: InboxReq[] = (reqRows || []).map((r) => ({ ...r, client: all.find((p) => p.id === r.project_id)?.client || 'Project' } as InboxReq));
  const ordered = [...reqs.filter((r) => r.status === 'open' || r.status === 'in_progress'), ...reqs.filter((r) => r.status !== 'open' && r.status !== 'in_progress').slice(0, 60)];
  const openReqs = reqs.filter((r) => r.status === 'open');
  const reqCount = (id: string) => openReqs.filter((r) => r.project_id === id).length;
  const { data: admins } = await sb.from('staff').select('*').eq('role', 'admin');
  const showAdmin = st.role === 'admin' || !(admins || []).some((a) => (a as { active?: boolean }).active !== false);
  const f = (sp.f || 'all') as View;
  const q = (sp.q || '').toLowerCase();
  const list = all.filter((p) => (f === 'all' ? p.status !== 'archived' : p.status === f) && (!q || p.client.toLowerCase().includes(q)));
  const count = (k: string) => all.filter((p) => (k === 'all' ? p.status !== 'archived' : p.status === k)).length;
  return (
    <div className="db">
      <aside className="db-side">
        <div className="db-ws"><img src="/lp-logo.svg" alt="Lost Property" /><span className="db-ws-txt"><span>Lost Property</span><span className="db-ws-sub">Brand Platform</span></span></div>
        <form><label className="mute" htmlFor="q" style={{ position: 'absolute', left: -9999 }}>Search</label><input id="q" name="q" className="in" placeholder="Search..." defaultValue={sp.q} style={{ borderRadius: 8 }} /></form>
        <Link href="/studio?f=requests" className={'db-it' + (f === 'requests' ? ' on' : '')}><Inbox size={15} strokeWidth={1.75} aria-hidden />Requests<span className={'n' + (openReqs.length ? ' db-badge' : '')}>{openReqs.length || ''}</span></Link>
        <p className="db-h">Projects</p>
        {FILTERS.map(([k, label]) => <Link key={k} href={`/studio?f=${k}`} className={'db-it' + (f === k ? ' on' : '')}>{label}<span className="n">{count(k)}</span></Link>)}
        <p className="db-h">Clients</p>
        {all.filter((p) => p.status !== 'archived').map((p) => <Link key={p.id} href={`/studio/projects/${p.id}`} className="db-it">{p.client}<span className="n">{p.status === 'live' ? 'Live' : 'Draft'}</span></Link>)}
        {showAdmin ? <Link href="/studio/admin" className="db-it db-admin"><Settings size={15} strokeWidth={1.75} aria-hidden />Admin settings</Link> : null}
      </aside>
      <main className="db-main">
        <div className="db-top"><h1>{f === 'requests' ? 'Requests' : FILTERS.find(([k]) => k === f)?.[1]}</h1><Link className="btn pink" href="/studio/new">New project</Link></div>
        {f === 'requests' ? <RequestsInbox initial={ordered} thumbs={thumbs} /> : openReqs.length ? <section className="db-inbox" aria-labelledby="db-in-h">
          <div className="db-inbox-h"><h2 id="db-in-h"><Inbox size={16} strokeWidth={1.75} aria-hidden />{openReqs.length} new request{openReqs.length === 1 ? '' : 's'}</h2><Link href="/studio?f=requests" className="ov-more">All requests →</Link></div>
          <RequestsInbox initial={ordered} thumbs={thumbs} compact />
        </section> : null}
        {sp.deleted ? <div className="card" role="status" style={{ marginBottom: 20 }}>Deleted {sp.deleted}.{sp.repo ? (sp.repoFailed ? <> The GitHub repository <a href={`https://github.com/${sp.repo}`}>{sp.repo}</a> couldn’t be deleted; remove it on GitHub if you don’t need it.</> : <> The kit is still on GitHub at <a href={`https://github.com/${sp.repo}`}>{sp.repo}</a>.</>) : null}</div> : null}
        {f !== 'requests' ? <div className="db-grid">
          {list.map((p) => <ProjectCard key={p.id} p={{ id: p.id, client: p.client, slug: p.slug, status: p.status, updated_at: p.updated_at, repo_full_name: p.repo_full_name, thumb: thumbs[p.id], requests: reqCount(p.id), trialFonts: fontsNeedingLicence((p.brand?.fonts || []).map((f) => ({ ...f, files: f.files || [] }))).filter((f) => f.files.length).length }} />)}
        </div> : null}
        {f !== 'requests' && !list.length ? <p className="mute" style={{ padding: '40px 0' }}>No projects yet. Start one with New project.</p> : null}
      </main>
    </div>
  );
}
