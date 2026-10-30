import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Keeps the Supabase session fresh and sends signed-out visitors to /login (the MCP endpoint uses its own token).
export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)) }
  });
  const { data } = await sb.auth.getUser();
  const open = req.nextUrl.pathname.startsWith('/login') || req.nextUrl.pathname.startsWith('/auth') || req.nextUrl.pathname.startsWith('/api/mcp');
  if (!data.user && !open) {
    const url = req.nextUrl.clone(); url.pathname = '/login'; url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return res;
}
export const config = { matcher: ['/((?!_next|fonts|favicon|lp-logo).*)'] };
