import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { appOrigin } from '@/lib/origin';
import { encryptSecret } from '@/lib/crypto';
import { pluginsAccess } from '@/lib/plugins/server';
import { pluginById } from '@/lib/plugins/catalog';
import { authoriseUrl, canvaApp } from '@/lib/plugins/canva';

// Starts connecting an account: off to the app to allow access, then back to Resources → Plug-ins
export async function GET(_: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  const a = await pluginsAccess(slug); if (!a) return new Response('Not found', { status: 404 });
  const o = await appOrigin();
  // Apps live in Resources → Plug-ins; storage in Settings
  const where = pluginById(id)?.group === 'storage' ? `settings?plugin=${id}&msg=MSG#storage` : `resources?plugin=${id}&msg=MSG#plugins`;
  const back = (msg: string) => NextResponse.redirect(`${o}/p/${slug}/${where.replace('MSG', encodeURIComponent(msg))}`);
  if (!a.lead) return back('Only your portal’s lead can connect accounts.');
  if (id !== 'canva') return back('That one isn’t ready yet.');
  const app = await canvaApp(a.p.id);
  if (!app) return back('Lost Property hasn’t finished setting up Canva on the platform yet.');
  const state = randomBytes(18).toString('base64url');
  const { url, verifier } = authoriseUrl(o, state, app.id);
  const res = NextResponse.redirect(url);
  res.cookies.set('lp_canva', encryptSecret(JSON.stringify({ state, verifier, pid: a.p.id, slug, uid: a.acc.user.id })), { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/plugins/canva', maxAge: 900 });
  return res;
}
