import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/supabase/server';
import { BETA_COOKIE } from '@/lib/portalVersionServer';

// Studio only: open a client's Staging (the studio preview of the working copy), on the main portal or the beta
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { slug } = await ctx.params;
  const url = new URL(req.url);
  const which = url.searchParams.get('portal');
  const back = url.searchParams.get('to') || `/p/${slug}`;
  const res = NextResponse.redirect(new URL(back.startsWith('/') && !back.startsWith('//') ? back : `/p/${slug}`, url.origin));
  res.cookies.delete('lp-as-client');
  if (which === 'beta' || which === 'main') res.cookies.set(BETA_COOKIE, `${which}:${slug}`, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 8, secure: url.protocol === 'https:' });
  return res;
}
