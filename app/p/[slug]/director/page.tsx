import { readSwitches } from '@/lib/portal/switches';
import { notFound } from 'next/navigation';
import { portalContext } from '@/lib/portal/context';
import { canSee, projectStages, stageBadge } from '@/lib/features';
import { signMany } from '@/lib/storage/signed';
import { DirectorApp } from '@/components/director/DirectorApp';
import type { BrandKit } from '@/lib/director/model';
import { portalV2 } from '@/lib/portalVersion';
import { DirectorProjects } from '@/components/portal/v2/DirectorProjects';
import { isSubmitted, readMotion } from '@/lib/motion/model';
import { portalPackages } from '@/lib/portal/packages';

// Director: plan, shoot and generate short-form video in the brand's world, with its fonts, logos and colours
// loaded. Gated by the release stage (Admin settings → Releases); studio-only while it's in Labs.
export default async function DirectorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await portalContext(slug);
  if (ctx && !readSwitches(ctx.project.content).director) notFound();
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
  // Portal v2 (staging): the brand's motion, its logos as they are in Resources (SVG, so they can move), and its icons
  if (portalV2()) {
    const pk = await portalPackages(ctx);
    const files = (kind: string, re: RegExp) => { const p = pk.find((x) => x.kind === kind); return [...(p?.uploads || []).filter((u) => re.test(u.name)).map((u) => ({ path: u.path, name: u.name })), ...(p?.kitFiles || []).filter((f) => f.storage_path && re.test(f.path)).map((f) => ({ path: f.storage_path!, name: f.path.split('/').pop()! }))]; };
    const logos = files('logos', /\.svg$/i), icons = files('icons', /\.svg$/i).slice(0, 60);
    const { data: s2 } = await signMany('kits', [...logos, ...icons].map((f) => f.path), 6 * 3600);
    const u2 = Object.fromEntries((s2 || []).map((d) => [d.path, d.signedUrl]));
    const nice = (n: string) => n.replace(/\.(svg|png)$/i, '').replace(/[_-]+/g, ' ');
    if (logos.length) kit.logos = logos.filter((f) => u2[f.path]).map((f) => ({ name: nice(f.name), url: u2[f.path], key: f.path, light: /white|light|reverse|negative|inverse/i.test(f.name) }));
    kit.icons = icons.filter((f) => u2[f.path]).map((f) => ({ name: nice(f.name), url: u2[f.path] }));
    // Only motion a lead has submitted; until then Director works as before
    if (isSubmitted(ctx.project.content)) kit.motion = readMotion(ctx.project.content);
  }
  // Portal v2 (staging): Projects first, each holding its videos
  if (portalV2()) return <div className="v2-app dr-app-wrap"><DirectorProjects slug={slug} kit={kit} canGenerate={ctx.access.staff} badge={stageBadge(stage)} labs={stage === 'studio'} /></div>;
  return <div className="dr-app-wrap">
    <DirectorApp slug={slug} kit={kit} canGenerate={ctx.access.staff} badge={stageBadge(stage)} labs={stage === 'studio'} />
  </div>;
}
