import { adminClient } from '@/lib/supabase/server';
import { downloadUrl, portalContext } from '@/lib/portal/context';
import { TeamFileRemove, TeamFileUpload } from '@/components/portal/TeamFiles';

const STATUS: Record<string, string> = { ready: 'Ready', in_review: 'In review', in_production: 'In production', not_in_scope: 'Not in scope' };

// Downloads: the kit of parts from the brief, by part, with what's ready to take away.
export default async function Downloads({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = (await portalContext(slug))!;
  const { data: parts } = await adminClient().from('deliverable_parts').select('key, ord, title, contains, format, status, visible').eq('project_id', ctx.project.id).order('ord');
  const shown = (parts || []).filter((d) => (ctx.preview || d.visible) && (d.key !== 'team' || true));
  const hasTeam = shown.some((d) => d.key === 'team');
  const withFiles = await Promise.all(shown.map(async (d) => ({ ...d, files: await Promise.all(ctx.files.filter((f) => f.part === d.key).map(async (f) => ({ ...f, href: await downloadUrl(f, ctx.preview, slug) }))) })));
  return (
    <div className="pt-page">
      <header className="pt-chhead">
        <p className="mute">The kit of parts</p>
        <h1 className="pt-display">Downloads</h1>
        <p className="pt-lede">Everything in the brief, in open formats that work with any tool, or none.{ctx.project.repo_full_name ? <> Your team can also use the <a href={`https://github.com/${ctx.project.repo_full_name}`}>GitHub repository</a>.</> : null}</p>
      </header>
      {!withFiles.length ? <p className="mute">The kit is being prepared.</p> : null}
      {!hasTeam && ctx.access.canManage ? <section className="pt-part"><div><p className="mute">Shared by your team</p><h2 className="pt-h2" style={{ margin: '4px 0' }}>Team files</h2><p className="mute">Photography, presentations, signed-off artwork: anything your team should be able to download.</p></div><div className="pt-files"><TeamFileUpload slug={slug} /></div></section> : null}
      {withFiles.map((d, i) => (
        <section key={d.key} className="pt-part">
          <div><p className="mute"><span className="pt-n">{String(i + 1).padStart(2, '0')}</span>{d.format}</p><h2 className="pt-h2" style={{ margin: '4px 0' }}>{d.title}</h2><p className="mute">{d.contains}</p><span className={'tag' + (d.status === 'ready' ? ' live' : '')}>{STATUS[d.status]}</span></div>
          <div className="pt-files">{d.key === 'team' && ctx.access.canManage ? <TeamFileUpload slug={slug} /> : null}{d.files.map((f) => <div key={f.path} className="pt-file"><span>{d.key === 'team' ? f.path.replace(/^team\//, '') : f.path}</span><span className="mute">{f.format}</span>{f.href ? <a className="btn" href={f.href}>Download</a> : <span className="mute">{STATUS[d.status]}</span>}{d.key === 'team' && ctx.access.canManage ? <TeamFileRemove slug={slug} path={f.path} /> : null}</div>)}{d.key === 'team' && !d.files.length ? <p className="mute" style={{ margin: 0 }}>Nothing yet.</p> : null}</div>
        </section>
      ))}
    </div>
  );
}
