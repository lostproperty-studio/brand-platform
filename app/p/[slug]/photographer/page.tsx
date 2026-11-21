import { readSwitches } from '@/lib/portal/switches';
import { notFound } from 'next/navigation';
import { portalContext } from '@/lib/portal/context';
import { canSee, projectStages } from '@/lib/features';
import { portalV2 } from '@/lib/portalVersion';
import { nameOf } from '@/lib/guideVersions';
import { PhotographerApp } from '@/components/portal/v2/PhotographerApp';

// Photographer (new portal): collections of on-brand images, checked by the art director, edited with effect layers.
// Behind its release stage (Admin settings → Releases): studio-only to start.
export default async function PhotographerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!portalV2()) notFound();
  const ctx = await portalContext(slug);
  if (ctx && !readSwitches(ctx.project.content).photographer) notFound();
  if (!ctx?.snap) notFound();
  const stage = (await projectStages(ctx.project.id)).photographer;
  if (!canSee(stage, ctx.preview)) notFound();
  return <div className="v2-app"><PhotographerApp slug={slug} client={ctx.project.client} staff={ctx.access.staff} labs={stage === 'studio'} me={nameOf(ctx.access.user)} /></div>;
}
