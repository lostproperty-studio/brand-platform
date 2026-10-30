import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { Review, type Item } from '@/components/Review';
import { ProjectActions } from '@/components/ProjectActions';

const TABS = [['overview', 'Overview'], ['review', 'Review'], ['deliverables', 'Deliverables']] as const;
const STATUS: Record<string, string> = { ready: 'Ready', in_review: 'In review', in_production: 'In production', not_in_scope: 'Not in scope' };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; created?: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) redirect('/');
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : 'overview';
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('id, client, name, line, slug, status, figma_key, repo_full_name, kit_version, published_at, ai_key_hint').eq('id', id).maybeSingle();
  if (!p) notFound();

  async function setPartStatus(form: FormData) {
    'use server';
    const s = await requireStaff(); if (s instanceof Response) return;
    await adminClient().from('deliverable_parts').update({ status: String(form.get('status')) }).eq('id', String(form.get('part')));
    redirect(`/studio/projects/${id}?tab=deliverables`);
  }

  let body: React.ReactNode = null;
  if (tab === 'overview') {
    body = <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
      {sp.created ? <div className="card" style={{ background: '#000', color: '#fff' }}>Project created, kit built and portal published.</div> : null}
      <h1 style={{ fontSize: 28, fontWeight: 400, margin: 0 }}>{p.client}</h1>
      <p className="mute" style={{ margin: 0 }}>{p.line}</p>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ margin: 0 }}>Portal: <a href={`/p/${p.slug}`}>/p/{p.slug}</a> · <span className={'tag ' + p.status}>{p.status}</span></p>
        <p style={{ margin: 0 }}>Kit repository: {p.repo_full_name ? <a href={`https://github.com/${p.repo_full_name}`} target="_blank" rel="noopener">{p.repo_full_name}</a> : <span className="mute">not built yet</span>} · v{p.kit_version}</p>
        <p style={{ margin: 0 }}>Figma: {p.figma_key ? <a href={`https://www.figma.com/design/${p.figma_key}`} target="_blank" rel="noopener">open file</a> : <span className="mute">not linked</span>}</p>
        <p style={{ margin: 0 }}>Client AI: {p.ai_key_hint ? `connected (key ending ${p.ai_key_hint})` : <span className="mute">not connected; the client adds their key in portal settings</span>}</p>
      </div>
      <ProjectActions id={p.id} status={p.status} hasRepo={!!p.repo_full_name} />
    </div>;
  }
  if (tab === 'review') {
    const { data: scan } = await sb.from('scans').select('id, figma_key').eq('project_id', id).eq('status', 'done').order('created_at', { ascending: false }).limit(1).maybeSingle();
    const { data: items } = scan ? await sb.from('review_items').select('*').eq('scan_id', scan.id).order('ord') : { data: [] };
    const withPrev = await Promise.all((items || []).map(async (it) => ({ ...it, preview: it.preview_path ? (await sb.storage.from('previews').createSignedUrl(it.preview_path, 3600)).data?.signedUrl ?? null : null })));
    body = scan ? <Review initial={withPrev as Item[]} figmaKey={scan.figma_key} /> : <p className="mute">No scan yet.</p>;
  }
  if (tab === 'deliverables') {
    const { data: parts } = await sb.from('deliverable_parts').select('id, title, contains, format, status, deliverable_files(path)').eq('project_id', id).order('ord');
    body = <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 900 }}>
      {(parts || []).map((d) => <div key={d.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ margin: 0 }}>{d.title} <span className="mute">· {d.format}</span></p>
        <p className="mute" style={{ margin: 0 }}>{d.contains} · {(d.deliverable_files || []).length} files</p>
        <form action={setPartStatus} className="row"><input type="hidden" name="part" value={d.id} />{Object.entries(STATUS).map(([k, label]) => <button key={k} name="status" value={k} className={'btn' + (d.status === k ? ' solid' : '')}>{label}</button>)}</form>
      </div>)}
      {!parts?.length ? <p className="mute">Build the kit to create the deliverables.</p> : null}
    </div>;
  }
  return (
    <div>
      <div className="pj-head"><Link className="btn" href="/studio">← Projects</Link><span className="pj-client">{p.client}</span><nav className="pj-tabs">{TABS.map(([k, l]) => <Link key={k} className={'pj-tab' + (k === tab ? ' on' : '')} href={`/studio/projects/${id}?tab=${k}`}>{l}</Link>)}</nav><a className="btn solid" style={{ marginLeft: 'auto' }} href={`/p/${p.slug}`}>Preview as client</a></div>
      <div style={{ padding: '20px 20px 80px' }}>{body}</div>
    </div>
  );
}
