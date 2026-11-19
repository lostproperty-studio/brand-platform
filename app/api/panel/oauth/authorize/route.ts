import { NextResponse } from 'next/server';
import { adminClient, currentUser } from '@/lib/supabase/server';
import { portalV2 } from '@/lib/portalVersion';
import { projectStages, canSee } from '@/lib/features';
import { issueCode, panelClient, redirectAllowed, stillMember } from '@/lib/plugins/panelAuth';

// The panel's sign-in: the app (Canva, Office, Google) opens this in a pop-up. Someone signs in to their portal as
// usual, and goes back to the app with a one-time code. Only people in that client's portal get one.
export async function GET(req: Request) {
  if (!portalV2()) return new Response('Not found', { status: 404 });
  const u = new URL(req.url), q = u.searchParams;
  const c = await panelClient(q.get('client_id') || '');
  const redirect = q.get('redirect_uri') || '';
  if (!c || !redirectAllowed(c.host, redirect)) return new Response('This panel isn’t set up for sign-in here. Ask your portal lead to set it up again in Resources → Plug-ins.', { status: 400 });
  const back = (p: Record<string, string>) => { const r = new URL(redirect); for (const [k, v] of Object.entries(p)) r.searchParams.set(k, v); if (q.get('state')) r.searchParams.set('state', q.get('state')!); return NextResponse.redirect(r.toString()); };
  if (q.get('response_type') !== 'code') return back({ error: 'unsupported_response_type' });
  const challenge = q.get('code_challenge');
  if (challenge && (q.get('code_challenge_method') || 'S256').toUpperCase() !== 'S256') return back({ error: 'invalid_request' });

  const user = await currentUser();
  if (!user) {
    const { data: p } = await adminClient().from('projects').select('slug').eq('id', c.project_id).maybeSingle();
    return NextResponse.redirect(new URL(`/login/${p?.slug || ''}?next=${encodeURIComponent(u.pathname + u.search)}`, u.origin));
  }
  const m = await stillMember(c.project_id, user.id);
  if (!m || !canSee((await projectStages(c.project_id)).plugins, m.staff)) return back({ error: 'access_denied' });
  return back({ code: await issueCode(c, user.id, redirect, challenge) });
}
