import { toolboxAuthorised, toolboxBrand } from '@/lib/toolboxExport';

export const maxDuration = 60;

// For the studio's Toolbox only: one brand's colours, type, design qualities, art direction, logos and imagery
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!toolboxAuthorised(req)) return new Response('Unauthorized', { status: 401 });
  const b = await toolboxBrand((await params).slug);
  return b ? Response.json(b) : new Response('Not found', { status: 404 });
}
