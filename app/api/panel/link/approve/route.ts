import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/supabase/server';
import { portalV2 } from '@/lib/portalVersion';
import { approveLink } from '@/lib/plugins/panelLink';

// Someone signed in on the platform approves their panel's sign-in, for one brand
export async function POST(req: Request) {
  if (!portalV2()) return new Response('Not found', { status: 404 });
  const user = await currentUser(); if (!user) return new Response('Sign in required', { status: 401 });
  const b = await req.json().catch(() => ({})) as { id?: string; project?: string };
  if (!b.id || !b.project) return new Response('Bad request', { status: 400 });
  return (await approveLink(String(b.id), user.id, String(b.project))) ? NextResponse.json({ ok: true }) : new Response('That sign-in link has run out. Start again from the panel.', { status: 410 });
}
