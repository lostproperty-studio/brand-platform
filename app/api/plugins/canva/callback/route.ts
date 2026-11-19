import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { appOrigin } from '@/lib/origin';
import { decryptSecret } from '@/lib/crypto';
import { currentUser } from '@/lib/supabase/server';
import { finishConnect, syncCanva } from '@/lib/plugins/canva';

export const maxDuration = 300;

// Back from Canva: keep the account's tokens (encrypted), make the folder and send the first files
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const o = await appOrigin();
  const jar = await cookies();
  let s: { state: string; verifier: string; pid: string; slug: string; uid: string } | null = null;
  try { s = JSON.parse(decryptSecret(jar.get('lp_canva')?.value || '')); } catch { s = null; }
  const back = (slug: string, msg: string) => { const r = NextResponse.redirect(`${o}/p/${slug}/resources?plugin=canva&msg=${encodeURIComponent(msg)}#plugins`); r.cookies.delete({ name: 'lp_canva', path: '/api/plugins/canva' }); return r; };
  if (!s) return NextResponse.redirect(`${o}/`);
  const user = await currentUser();
  if (!user || user.id !== s.uid || q.get('state') !== s.state) return back(s.slug, 'That didn’t work. Try connecting again.');
  if (q.get('error') || !q.get('code')) return back(s.slug, 'Canva wasn’t connected.');
  try {
    await finishConnect(s.pid, user.id, q.get('code')!, s.verifier, o);
    const r = await syncCanva(s.pid, s.slug, o).catch((e) => ({ error: (e as Error).message, sent: 0 }));
    return back(s.slug, r.error ? `Canva is connected. The first sync didn’t finish: ${r.error}` : `Canva is connected: ${r.sent} files sent to your Canva.`);
  } catch (e) { return back(s.slug, (e as Error).message); }
}
