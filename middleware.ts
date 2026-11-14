import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { RESERVED } from '@/lib/slugs';

// Keeps the Supabase session fresh and sends signed-out visitors to /login (the MCP endpoint uses its own token).
export async function middleware(req: NextRequest) {
  // Short portal addresses: brand.lostproperty.studio/tileyard serves the Tileyard portal (/p/tileyard)
  const first = req.nextUrl.pathname.split('/')[1] || '';
  const short = !!first && !RESERVED.has(first) && !first.includes('.');
  const target = short ? req.nextUrl.clone() : null;
  if (target) target.pathname = '/p' + req.nextUrl.pathname;
  const res = target ? NextResponse.rewrite(target) : NextResponse.next({ request: req });
  // A deployment without its Supabase settings (often a preview, when they're only set for Production in Vercel)
  // says so plainly instead of failing every request
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return new NextResponse(`This ${process.env.VERCEL_ENV || ''} deployment has no Supabase settings. In Vercel → Settings → Environment Variables, make NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (and the other Supabase variables) available to Preview, then redeploy.`, { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)) }
  });
  const { data } = await sb.auth.getUser();
  const path = target ? target.pathname : req.nextUrl.pathname;
  const open = path.startsWith('/login') || path.startsWith('/auth') || path.startsWith('/join/') || path.startsWith('/api/mcp') || path === '/api/health';
  if (!data.user && !open) {
    // Client portals send people to that client's own branded sign-in page
    const portal = path.match(/^\/p\/([^/]+)/);
    if (path.startsWith('/api/')) return new NextResponse('Sign in required', { status: 401 });
    const url = req.nextUrl.clone(); url.pathname = portal ? `/login/${portal[1]}` : '/login'; url.search = ''; url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  return res;
}
// Static files (the email images among them) are served as they are, without sign-in
export const config = { matcher: ['/((?!_next|fonts|dict|favicon|.*\\.(?:png|svg|jpg|jpeg|ico|webp|woff2?|aff|dic|txt)$).*)'] };
