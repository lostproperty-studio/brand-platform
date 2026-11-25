import { toolboxAuthorised, toolboxBrands } from '@/lib/toolboxExport';

// For the studio's Toolbox only (shared TOOLBOX_API_KEY): the brands Mockup Studio can import from
export async function GET(req: Request) {
  if (!toolboxAuthorised(req)) return new Response('Unauthorized', { status: 401 });
  return Response.json({ brands: await toolboxBrands() });
}
