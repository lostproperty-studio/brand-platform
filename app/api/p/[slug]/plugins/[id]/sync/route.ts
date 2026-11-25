import { NextResponse } from 'next/server';
import { appOrigin } from '@/lib/origin';
import { pluginsAccess, removeConnection } from '@/lib/plugins/server';
import { isPluginId } from '@/lib/plugins/catalog';
import { setCanvaApp, syncCanva } from '@/lib/plugins/canva';

export const maxDuration = 300;

// Sync now
export async function POST(_: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  const a = await pluginsAccess(slug); if (!a) return new Response('Not found', { status: 404 });
  if (!a.lead) return new Response('Only your portal’s lead can sync.', { status: 403 });
  if (id !== 'canva') return new Response('That one isn’t ready yet.', { status: 400 });
  try { return NextResponse.json(await syncCanva(a.p.id, slug, await appOrigin())); }
  catch (e) { return new Response((e as Error).message, { status: 502 }); }
}

// The studio enters a client's own Canva integration (made in their Canva team), or clears it to use Lost Property's
export async function PUT(req: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  const a = await pluginsAccess(slug); if (!a) return new Response('Not found', { status: 404 });
  if (!a.acc.staff || id !== 'canva') return new Response('Only Lost Property can change this.', { status: 403 });
  const b = await req.json().catch(() => ({})) as { clientId?: string; secret?: string };
  const app = b.clientId && b.secret ? { id: String(b.clientId).trim().slice(0, 200), secret: String(b.secret).trim().slice(0, 400) } : null;
  try { await setCanvaApp(a.p.id, app, a.acc.user.id); } catch (e) { return new Response((e as Error).message, { status: 503 }); }
  return NextResponse.json({ ok: true });
}

// Disconnect: the platform forgets the account. What's already in their app stays there.
export async function DELETE(_: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  const a = await pluginsAccess(slug); if (!a) return new Response('Not found', { status: 404 });
  if (!a.lead) return new Response('Only your portal’s lead can disconnect.', { status: 403 });
  if (!isPluginId(id)) return new Response('Not found', { status: 404 });
  await removeConnection(a.p.id, id);
  return NextResponse.json({ ok: true });
}
