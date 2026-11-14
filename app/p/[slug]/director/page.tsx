import { notFound } from 'next/navigation';
import { portalContext } from '@/lib/portal/context';
import { canSee, projectStages, stageBadge } from '@/lib/features';
import { signMany } from '@/lib/storage/signed';
import { DirectorApp } from '@/components/director/DirectorApp';
import type { BrandKit } from '@/lib/director/model';

// Director: plan, shoot and generate short-form video in the brand's world, with its fonts, logos and colours
// loaded. Gated by the release stage (Admin settings → Releases); studio-only while it's in Labs.
export default async function DirectorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await portalContext(slug);
  if (!ctx?.snap) notFound();
  const stage = (await projectStages(ctx.project.id)).director;
  if (!canSee(stage, ctx.preview)) notFound();
  const logoFiles = ctx.files.filter((f) => f.path.startsWith('assets/logo/') && f.storage_path && /\.(svg|png)$/i.test(f.path));
  const { data: signed } = await signMany('kits', logoFiles.map((f) => f.storage_path!), 6 * 3600);
  const url = Object.fromEntries((signed || []).map((d) => [d.path, d.signedUrl]));
  const kit: BrandKit = {
    client: ctx.project.client,
    colours: (ctx.snap.colours || []).map((c) => ({ name: c.name, hex: c.hex, role: c.role })),
    fonts: ctx.fonts.filter((f) => f.files.length).map((f) => ({ role: f.role, label: f.label, name: f.name })),
    logos: logoFiles.filter((f) => url[f.storage_path!]).map((f) => ({ name: f.path.split('/').pop()!.replace(/\.(svg|png)$/i, '').replace(/[_-]+/g, ' '), url: url[f.storage_path!], light: /white|light|reverse|negative|inverse/i.test(f.path.split('/').pop()!) }))
  };
  return <div className="dr-app-wrap">
    <DirectorApp slug={slug} kit={kit} canGenerate={ctx.access.staff} badge={stageBadge(stage)} labs={stage === 'studio'} />
  </div>;
}
