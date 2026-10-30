import { redirect } from 'next/navigation';
import { chapterSlug, portalContext } from '@/lib/portal/context';

export default async function GuidelinesIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const first = (await portalContext(slug))?.snap?.guide?.chapters[0];
  if (first) redirect(`/p/${slug}/guidelines/${chapterSlug(first.id)}`);
  return <div className="pt-page"><h1 className="pt-display">Guidelines</h1><p className="mute">The guidelines are being prepared.</p></div>;
}
