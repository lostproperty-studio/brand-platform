import { appOrigin } from '@/lib/origin';
import { pluginsAccess } from '@/lib/plugins/server';
import { figmaPlugin } from '@/lib/plugins/figma';

// The Figma plugin as a zip, for anyone on the portal to download and import into Figma
export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const a = await pluginsAccess(slug); if (!a) return new Response('Not found', { status: 404 });
  const zip = figmaPlugin(await appOrigin(), slug, a.p.client);
  return new Response(zip as unknown as BodyInit, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${slug}-figma-brand-panel.zip"`, 'Cache-Control': 'no-store' } });
}
