import { notFound } from 'next/navigation';
import { portalContext } from '@/lib/portal/context';
import { PortalNav } from '@/components/portal/PortalNav';
import { AskDock } from '@/components/portal/AskDock';
import { logVisit } from '@/lib/activity';
import { hasShowcase } from '@/lib/showcase';

// The client portal: an online version of the brand guidelines, with the kit, Canvas and Ask alongside.
export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await portalContext(slug);
  if (!ctx) notFound();
  const { project, snap, fontCss, fonts, sidebar, preview, access } = ctx;
  if (!access.staff) await logVisit(project.id, access.user.id);
  const display = fonts.find((f) => f.role === 'display' && f.files.length) || fonts.find((f) => f.files.length);
  const body = fonts.find((f) => f.role === 'body' && f.files.length);
  const chapters = (snap?.guide?.chapters || []).map((c) => ({ id: c.id, title: c.title }));
  const css = fontCss + `\n.pt { ${display ? `--pt-display: var(--font-${display.role});` : ''} ${body ? `--pt-body: var(--font-${body.role});` : ''} }`;
  return (
    <div className="pt">
      <style>{css}</style>
      <PortalNav slug={slug} client={project.client} logoUrl={sidebar.full} miniUrl={sidebar.mini} chapters={chapters} showSettings={access.canManage} showShowcase={preview || hasShowcase(snap?.showcase)} />
      <div className="pt-main">
        {preview ? <div className="pt-preview" role="status">Studio preview of the working copy. {project.status === 'live' ? 'Clients see the last published version.' : 'Not published yet, so clients can’t see it.'} <a href={`/studio/projects/${project.id}`}>Back to the studio</a></div> : null}
        {snap ? <AskDock slug={slug} client={project.client} aiConnected={!!project.ai_key_hint || preview} studioAi={preview} canConnect={access.clientAdmin} /> : null}
        {!snap ? <div className="pt-empty"><h1>Coming soon</h1><p className="mute">Lost Property is preparing your brand guidelines. You’ll get an email when they’re ready.</p></div> : children}
      </div>
    </div>
  );
}
