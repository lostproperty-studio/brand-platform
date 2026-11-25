import { appOrigin } from '@/lib/origin';
import { pluginsAccess } from '@/lib/plugins/server';
import { officeManifest } from '@/lib/plugins/office';

// The Office add-in file for this client, for their Microsoft 365 admin to upload (?kind=documents or mail)
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const a = await pluginsAccess(slug); if (!a) return new Response('Not found', { status: 404 });
  const kind = new URL(req.url).searchParams.get('kind') === 'mail' ? 'mail' : 'documents';
  const xml = officeManifest(kind, { origin: await appOrigin(), slug, client: a.p.client, projectId: a.p.id });
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="${slug}-brand-${kind === 'mail' ? 'outlook' : 'word-powerpoint-excel'}.xml"`, 'Cache-Control': 'no-store' } });
}
