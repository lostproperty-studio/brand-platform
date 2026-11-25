import { notFound } from 'next/navigation';
import { portalContext, signFrames } from '@/lib/portal/context';
import { APPS, type AppKey } from '@/lib/portalVersion';
import { readStates } from '@/lib/portal/switches';
import { getAppPreviews } from '@/lib/portal/appPreviewsServer';
import { canSee, projectStages } from '@/lib/features';
import { showcasePaths } from '@/lib/showcase';
import { coverPaths } from '@/lib/portal/covers';
import { AppPreview } from '@/components/portal/v2/AppPreview';

// An app's About page: what it does, feature by feature, with a glimpse of each in this brand's own logo and pictures.
// Opened from About on the app's home screen, or from the greyed-out icon while the app is coming soon.
export default async function PreviewPage({ params }: { params: Promise<{ slug: string; app: string }> }) {
  const { slug, app } = await params;
  const def = APPS.find((a) => a.key === app); if (!def) notFound();
  const ctx = await portalContext(slug); if (!ctx?.v2) notFound();
  const state = readStates(ctx.project.content)[def.key];
  if (state === 'off') notFound();
  // It's coming soon unless it's on and built (Photographer counts as built once its release stage allows)
  const built = def.ready || (def.key === 'photographer' && canSee((await projectStages(ctx.project.id)).photographer, ctx.preview));
  const soon = state === 'soon' || !built;
  const urls = await signFrames([...new Set([...(ctx.snap?.showcase ? showcasePaths(ctx.snap.showcase) : []), ...(ctx.snap?.guide ? coverPaths(ctx.snap.guide) : [])])]);
  const images = Object.entries(urls).filter(([p]) => /\.(jpe?g|png|webp|avif)$/i.test(p)).map(([, u]) => u).slice(0, 8);
  const previews = await getAppPreviews();
  const open = built && (!soon || ctx.access.staff) ? { href: `/p/${slug}/${app}`, studio: soon } : null;
  return <AppPreview app={def.key as AppKey} name={def.name} preview={previews[def.key]} client={ctx.project.client} logo={ctx.sidebar.full || ctx.logoUrl || null} images={images}
    open={open} soon={soon} back={soon ? `/p/${slug}` : `/p/${slug}/${app}`} />;
}
