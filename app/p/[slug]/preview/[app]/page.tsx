import { notFound, redirect } from 'next/navigation';
import { portalContext, signFrames } from '@/lib/portal/context';
import { APPS, portalV2, type AppKey } from '@/lib/portalVersion';
import { readStates } from '@/lib/portal/switches';
import { APP_PREVIEWS } from '@/lib/portal/appPreviews';
import { showcasePaths } from '@/lib/showcase';
import { coverPaths } from '@/lib/portal/covers';
import { AppPreview } from '@/components/portal/v2/AppPreview';

// A coming-soon app: what it will do, feature by feature, with a glimpse of each in this brand's own logo, colours
// and pictures. Opened from the greyed-out app icon. If the app is already on and ready, it goes straight there.
export default async function PreviewPage({ params }: { params: Promise<{ slug: string; app: string }> }) {
  const { slug, app } = await params;
  if (!portalV2()) notFound();
  const def = APPS.find((a) => a.key === app); if (!def) notFound();
  const ctx = await portalContext(slug); if (!ctx) notFound();
  const state = readStates(ctx.project.content)[def.key];
  if (state === 'off') notFound();
  if (state === 'on' && def.ready && !ctx.access.staff) redirect(`/p/${slug}/${app}`);
  const urls = await signFrames([...new Set([...(ctx.snap?.showcase ? showcasePaths(ctx.snap.showcase) : []), ...(ctx.snap?.guide ? coverPaths(ctx.snap.guide) : [])])]);
  const images = Object.entries(urls).filter(([p]) => /\.(jpe?g|png|webp|avif)$/i.test(p)).map(([, u]) => u).slice(0, 8);
  const colours = (ctx.snap?.colours || []).slice(0, 6).map((c) => ({ name: c.name, hex: c.hex }));
  return <AppPreview app={def.key as AppKey} name={def.name} preview={APP_PREVIEWS[def.key]} client={ctx.project.client} logo={ctx.sidebar.full || ctx.logoUrl || null} colours={colours} images={images}
    studioOpen={ctx.access.staff && def.ready ? `/p/${slug}/${app}` : null} back={`/p/${slug}`} />;
}
