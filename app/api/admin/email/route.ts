import { clearEmailError, lastEmailError, noteEmailError } from '@/lib/email/status';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { emailFrom, emailProvider, sendEmail } from '@/lib/email/send';
import { clientBrand, studioBrand } from '@/lib/email/brand';
import { clientInviteEmail, requestUpdateEmail, signInEmail, studioInviteEmail } from '@/lib/email/templates';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

async function build(kind: string, slug?: string | null) {
  const b = slug ? await clientBrand(slug) : studioBrand();
  const url = `${env.appUrl()}/auth/verify?token_hash=example`;
  if (kind === 'invite') return slug ? clientInviteEmail(b, url, 'a creator', 'Steffan') : studioInviteEmail(b, url, 'Steffan');
  if (kind === 'request') return requestUpdateEmail(b, `${env.appUrl()}/p/${slug || 'example'}/settings`, 'Logo files for signage', 'Done', 'All set: the files are in Downloads under Logos.');
  return signInEmail(b, url);
}

// Email setup: which service sends, a preview of each email in any project's look, and a test send
export async function GET(req: Request) {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  const u = new URL(req.url);
  if (u.searchParams.get('preview')) { const e = await build(u.searchParams.get('preview')!, u.searchParams.get('slug')); return new Response(e.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }); }
  return NextResponse.json({ provider: emailProvider(), from: emailFrom(), lastError: await lastEmailError() });
}

export async function POST(req: Request) {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  const b = await req.json().catch(() => ({}));
  if (!emailProvider()) return NextResponse.json({ error: 'Set up Resend or SMTP first (see the steps).' }, { status: 400 });
  try { const e = await build(String(b.kind || 'signin'), b.slug || null); await sendEmail({ to: st.user.email!, ...e, subject: `[Test] ${e.subject}` }); await clearEmailError(); }
  catch (e) { await noteEmailError('test', e); return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  return NextResponse.json({ ok: true, to: st.user.email });
}
