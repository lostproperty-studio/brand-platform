import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { pluginsAccess, saveConnection, setHome } from '@/lib/plugins/server';
import { isPluginId, pluginById, PANEL_PARTS } from '@/lib/plugins/catalog';

const Body = z.union([
  z.object({ plugin: z.string(), settings: z.record(z.string(), z.union([z.boolean(), z.string().max(120)])) }),
  z.object({ panel: z.record(z.string(), z.boolean()) })
]);

// Changes a plug-in's settings, or what the panel shows in every app. The client's lead (or the studio) only.
export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const a = await pluginsAccess(slug); if (!a) return new Response('Not found', { status: 404 });
  if (!a.lead) return new Response('Only your portal’s lead can change plug-ins.', { status: 403 });
  const b = Body.safeParse(await req.json().catch(() => ({}))); if (!b.success) return new Response('Bad request', { status: 400 });
  if ('panel' in b.data) {
    const sb = adminClient();
    const { data: p } = await sb.from('projects').select('content').eq('id', a.p.id).single();
    const c = (p?.content || {}) as Record<string, unknown>;
    const next = { ...((c.panel as object) || {}) } as Record<string, boolean>;
    for (const { id } of PANEL_PARTS) if (typeof b.data.panel[id] === 'boolean') next[id] = b.data.panel[id];
    await sb.from('projects').update({ content: { ...c, panel: next } }).eq('id', a.p.id);
    return NextResponse.json({ panel: next });
  }
  if (!isPluginId(b.data.plugin)) return new Response('Not found', { status: 404 });
  const def = pluginById(b.data.plugin)!;
  const clean: Record<string, boolean | string> = {};
  for (const s of def.settings) { const v = b.data.settings[s.id]; if (v === undefined || typeof v !== typeof s.default || (s.studioOnly && !a.acc.staff)) continue; clean[s.id] = v; }
  try {
    if (clean.home === true) await setHome(a.p.id, def.id);
    await saveConnection(a.p.id, def.id, { settings: clean });
  } catch (e) { return new Response((e as Error).message, { status: 503 }); }
  return NextResponse.json({ ok: true });
}
