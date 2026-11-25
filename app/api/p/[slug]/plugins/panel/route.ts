import { NextResponse } from 'next/server';
import { appOrigin } from '@/lib/origin';
import { pluginsAccess } from '@/lib/plugins/server';
import { newPanelClient } from '@/lib/plugins/panelAuth';

// New sign-in credentials for the LP panel in one app (replacing any before, which signs everyone out of it).
// Shown once. For Canva they're pasted into the private app's settings in the client's Canva team.
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const a = await pluginsAccess(slug); if (!a) return new Response('Not found', { status: 404 });
  if (!a.lead) return new Response('Only your portal’s lead can set up the panel.', { status: 403 });
  const { host } = await req.json().catch(() => ({}));
  if (host !== 'canva') return new Response('That panel isn’t ready yet.', { status: 400 });
  try {
    const { clientId, secret } = await newPanelClient(a.p.id, host, a.acc.user.id);
    const o = await appOrigin();
    return NextResponse.json({ clientId, secret, authorizeUrl: `${o}/api/panel/oauth/authorize`, tokenUrl: `${o}/api/panel/oauth/token`, apiUrl: `${o}/api/panel` });
  } catch (e) { return new Response((e as Error).message, { status: 503 }); }
}
