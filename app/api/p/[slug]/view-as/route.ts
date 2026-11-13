import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/supabase/server';

// Studio only: see a portal exactly as a client does (the published version), or go back to the live preview
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { slug } = await ctx.params;
  const url = new URL(req.url);
  const client = url.searchParams.get('mode') !== 'studio';
  const back = url.searchParams.get('to') || `/p/${slug}`;
  const res = NextResponse.redirect(new URL(back.startsWith('/') ? back : `/p/${slug}`, url.origin));
  if (client) res.cookies.set('lp-as-client', slug, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 4, secure: url.protocol === 'https:' });
  else res.cookies.delete('lp-as-client');
  return res;
}
