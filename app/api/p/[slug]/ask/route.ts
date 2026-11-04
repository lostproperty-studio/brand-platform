import { NextResponse } from 'next/server';
import { portalContext } from '@/lib/portal/context';
import { askCatalog } from '@/lib/portal/askCatalog';

// The cards Ask can show in answers (colours, logo files, downloads, guideline pages, typefaces)
export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const pc = await portalContext(slug);
  if (!pc?.snap) return new Response('Not found', { status: 404 });
  return NextResponse.json(await askCatalog(pc, slug), { headers: { 'Cache-Control': 'private, max-age=300' } });
}
