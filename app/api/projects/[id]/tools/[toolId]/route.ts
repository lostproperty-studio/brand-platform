import { teamGate } from '@/lib/studioTeam';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { listTools, TOOL_BUCKET } from '@/lib/tools';
import { ICON_NAMES } from '@/lib/icons';

const Patch = z.object({ name: z.string().min(1).max(60).optional(), icon: z.string().refine((v) => ICON_NAMES.includes(v)).optional(), description: z.string().max(300).optional(), styling: z.enum(['full', 'light', 'none']).optional(), ai_enabled: z.boolean().optional(), visible: z.boolean().optional(), ord: z.number().int().optional(), artwork: z.string().max(300).optional(), beta: z.boolean().optional() });

// Edit a tool's details (JSON) or replace its HTML file (form upload).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; toolId: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id, toolId } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'tools'); if (gate) return gate; }
  const sb = adminClient();
  const { data: tool } = await sb.from('tools').select('kind, html_path').eq('id', toolId).eq('project_id', id).maybeSingle();
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
    const file = (await req.formData()).get('file');
    if (tool.kind !== 'html' || !(file instanceof File) || !/\.html?$/i.test(file.name)) return NextResponse.json({ error: 'Choose an .html file.' }, { status: 400 });
    const { error } = await sb.storage.from(TOOL_BUCKET).upload(tool.html_path || `tools/${id}/${toolId}/index.html`, new Uint8Array(await file.arrayBuffer()), { contentType: 'text/html', upsert: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await sb.from('tools').update({ updated_at: new Date().toISOString() }).eq('id', toolId);
  } else {
    const b = Patch.safeParse(await req.json().catch(() => ({})));
    if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    const { artwork, beta, ...fields } = b.data;
    if (Object.keys(fields).length) await sb.from('tools').update(fields).eq('id', toolId);
    if (artwork !== undefined || beta !== undefined) {
      // Per-tool settings live with the project's content (merged, so nothing else there changes)
      const { data: pr } = await sb.from('projects').select('content').eq('id', id).single();
      const content = (pr?.content || {}) as { toolSettings?: Record<string, { artwork?: string; beta?: boolean }> };
      const next = { ...(content.toolSettings?.[toolId] || {}), ...(artwork !== undefined ? { artwork: artwork.trim() } : {}), ...(beta !== undefined ? { beta } : {}) };
      await sb.from('projects').update({ content: { ...content, toolSettings: { ...(content.toolSettings || {}), [toolId]: next } } }).eq('id', id);
    }
  }
  return NextResponse.json({ tools: await listTools(id, true) });
}

export async function GET(_: Request, ctx: { params: Promise<{ id: string; toolId: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id, toolId } = await ctx.params;
  { const gate = await teamGate(id, st, 'viewer', 'tools'); if (gate) return gate; }
  const { data: pr } = await adminClient().from('projects').select('content').eq('id', id).single();
  return NextResponse.json({ settings: ((pr?.content as { toolSettings?: Record<string, unknown> } | null)?.toolSettings || {})[toolId] || {} });
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string; toolId: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id, toolId } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'tools'); if (gate) return gate; }
  const sb = adminClient();
  const { data: tool } = await sb.from('tools').select('kind, html_path').eq('id', toolId).eq('project_id', id).maybeSingle();
  if (!tool) return NextResponse.json({ tools: await listTools(id, true) });
  if (tool.html_path) await sb.storage.from(TOOL_BUCKET).remove([tool.html_path]);
  await sb.from('tools').delete().eq('id', toolId);
  return NextResponse.json({ tools: await listTools(id, true) });
}
