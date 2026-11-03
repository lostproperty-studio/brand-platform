import { adminClient } from '@/lib/supabase/server';
import { portalContext } from '@/lib/portal/context';
import { buildSpec, componentsCss, tokensCss } from '@/lib/designSystem';
import { previewHtml } from '@/lib/designSystemPreview';
import { dsSource } from '@/lib/designSystemSource';

export const maxDuration = 60;

// The design system's preview.html, live in the portal: the same page as in the download, with the brand's
// fonts and files served through signed links. The studio also sees the judgement calls the system made.
export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const pc = await portalContext(slug);
  if (!pc?.snap) return new Response('Not found', { status: 404 });
  const { input, storage } = await dsSource(pc);
  const spec = buildSpec(input);
  const want = [...new Set([...spec.logo.all, ...spec.images, ...spec.graphics])].filter((p) => storage.has(p));
  const { data } = want.length ? await adminClient().storage.from('kits').createSignedUrls(want.map((p) => storage.get(p)!), 6 * 3600) : { data: [] };
  const signed = new Map((data || []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl]));
  const url = (p: string) => signed.get(storage.get(p) || '') || p;
  const html = previewHtml(spec, { css: tokensCss(spec, ' ') + componentsCss(spec), url, fontCss: pc.fontCss, notes: pc.preview });
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Frame-Options': 'SAMEORIGIN' } });
}
