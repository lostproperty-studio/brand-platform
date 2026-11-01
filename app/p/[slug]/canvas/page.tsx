import { redirect } from 'next/navigation';
import { portalContext } from '@/lib/portal/context';
import { listTools } from '@/lib/tools';

// Canvas moved into Tools as the built-in layout maker.
export default async function CanvasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await portalContext(slug);
  const t = ctx ? (await listTools(ctx.project.id, true)).find((x) => x.kind === 'layouts') : null;
  redirect(t && t.visible ? `/p/${slug}/tools/${t.id}` : `/p/${slug}/resources`);
}
