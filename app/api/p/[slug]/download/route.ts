import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';
import { logActivity } from '@/lib/activity';

// Downloads go through here so the studio can see what clients take away. Redirects to a short-lived file link.
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const p = await projectBySlug((await ctx.params).slug);
  if (!p) return new Response('Not found', { status: 404 });
  const acc = await requireProjectAccess(p.id);
  if (acc instanceof Response) return acc;
  const path = new URL(req.url).searchParams.get('path') || '';
  const sb = adminClient();
  const { data: f } = await sb.from('deliverable_files').select('path, storage_path, deliverable_parts!inner(project_id, status, visible)').eq('deliverable_parts.project_id', p.id).eq('path', path).maybeSingle();
  const part = f?.deliverable_parts as unknown as { status: string; visible: boolean } | undefined;
  if (!f?.storage_path || !part || (!acc.staff && (!part.visible || part.status !== 'ready'))) return new Response('Not available yet', { status: 404 });
  const { data } = await sb.storage.from('kits').createSignedUrl(f.storage_path, 300, { download: path.split('/').pop() });
  if (!data?.signedUrl) return new Response('Not found', { status: 404 });
  if (!acc.staff) await logActivity(p.id, acc.user.id, 'download', path);
  return Response.redirect(data.signedUrl, 302);
}
