import { notFound } from 'next/navigation';
import { portalContext } from '@/lib/portal/context';
import { PortalNav } from '@/components/portal/PortalNav';
import { AskDock } from '@/components/portal/AskDock';
import { logVisit } from '@/lib/activity';
import { hasShowcase } from '@/lib/showcase';
import { voiceReady } from '@/lib/voice';
import { PreviewComments } from '@/components/portal/PreviewComments';
import { canSee, projectStages, stageBadge } from '@/lib/features';
import { APPS, portalName } from '@/lib/portalVersion';
import { GuideShell } from '@/components/portal/v2/GuideShell';
import { readStates, readSwitches, usesStudioAi } from '@/lib/portal/switches';
import { getAppPreviews } from '@/lib/portal/appPreviewsServer';

// The client portal: an online version of the brand guidelines, with the kit, Canvas and Ask alongside.
export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await portalContext(slug);
  if (!ctx) notFound();
  const { project, snap, fontCss, fonts, sidebar, preview, access, asClient, v2 } = ctx;
  if (!access.staff) await logVisit(project.id, access.user.id);
  const display = fonts.find((f) => f.role === 'display' && f.files.length) || fonts.find((f) => f.files.length);
  const body = fonts.find((f) => f.role === 'body' && f.files.length);
  const chapters = (snap?.guide?.chapters || []).map((c) => ({ id: c.id, title: c.title }));
  // Release gate: features at 'studio' show only in the studio preview; 'beta' and 'live' show to the client too
  const stages = await projectStages(project.id);
  const on = readSwitches(project.content);
  const studioAi = usesStudioAi(project.content);
  const features = on.director && canSee(stages.director, preview) ? [{ label: 'Director' as const, path: 'director', badge: stageBadge(stages.director) }] : [];
  // The new portal (staging site, or this project's 'portal' stage): the apps get their own section; the old Writer and Director entries drop out of the pages
  // Photographer opens once it's at a stage this person can see (Admin settings → Releases); studio-only to start
  // Apps that are on and built open; ones coming soon (or not built yet) are greyed and open a preview of what they'll do
  const st = readStates(project.content);
  const previews = v2 ? await getAppPreviews() : null;
  const apps = v2 ? APPS.filter((x) => on[x.key]).map((x) => ({ key: x.key, name: x.name, teaser: previews?.[x.key].teaser, ready: st[x.key] === 'on' && (x.ready || (x.key === 'photographer' && canSee(stages.photographer, preview))) })) : [];
  const css = fontCss + `\n.pt { ${display ? `--pt-display: var(--font-${display.role});` : ''} ${body ? `--pt-body: var(--font-${body.role});` : ''} }`;
  return (
    <div className="pt">
      <style>{css}</style>
      <PortalNav showcaseName={snap?.showcase?.nav} slug={slug} client={project.client} logoUrl={sidebar.full} miniUrl={sidebar.mini} chapters={chapters} showSettings={access.canManage} showShowcase={on.showcase && (preview || hasShowcase(snap?.showcase))} showWriter={!v2 && (preview || (!!snap?.voice && voiceReady(snap.voice) && !!snap.voice.writer))} features={v2 ? [] : features} apps={apps} rail={v2} />
      <div className="pt-main">
        {preview ? <div className="pt-preview" role="status"><b>Staging</b> · your latest changes, private to Lost Property{ctx.portal.canToggle && ctx.portal.beta ? <> · {ctx.portal.onBeta ? `${portalName(ctx.portal.beta)} (beta)` : `${portalName(ctx.portal.main)} (main)`} <a href={`/api/p/${slug}/staging?portal=${ctx.portal.onBeta ? 'main' : 'beta'}&to=/p/${slug}`}>Switch to {ctx.portal.onBeta ? 'main' : 'the beta'}</a></> : null}. <a href={`/api/p/${slug}/view-as?mode=client`}>View as the client</a> · {project.status === 'live' ? 'Clients see the last published version.' : 'Not published yet, so clients can’t see it.'} <a href={`/studio/projects/${project.id}`}>Back to the studio</a></div> : null}
        {asClient ? <div className="pt-preview as-client" role="status">You’re seeing exactly what {project.client}’s team sees: {project.status === 'live' ? 'the published version' : 'nothing yet, because it isn’t published'}, with their downloads, apps and AI. <a href={`/api/p/${slug}/view-as?mode=studio`}>Back to the studio preview</a></div> : null}
        {preview ? <PreviewComments projectId={project.id} v2={v2} /> : null}
        {snap ? <AskDock slug={slug} client={project.client} aiConnected={!!project.ai_key_hint || preview || studioAi} studioAi={preview || studioAi} canConnect={access.clientAdmin} lpChat={v2 && canSee(stages.support, preview)} /> : null}
        {!snap ? <div className="pt-empty"><h1>Coming soon</h1><p className="mute">Lost Property is preparing your brand guidelines. You’ll get an email when they’re ready.</p></div> : v2 ? <GuideShell slug={slug} chapters={chapters}>{children}</GuideShell> : children}
      </div>
    </div>
  );
}
