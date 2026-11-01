import { teamGate } from '@/lib/studioTeam';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { listTools, TOOL_BUCKET } from '@/lib/tools';
import { ICON_NAMES } from '@/lib/icons';

// Studio: the project's tools. Upload a self-contained HTML file to add one.
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'viewer', 'tools'); if (gate) return gate; }
  return NextResponse.json({ tools: await listTools(id, true) });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'tools'); if (gate) return gate; }
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const name = String(form?.get('name') || '').trim().slice(0, 60);
  if (!(file instanceof File) || !/\.html?$/i.test(file.name)) return NextResponse.json({ error: 'Choose an .html file.' }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'The file must be under 4 MB. Link large images from the web or the kit instead of embedding them.' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'Give the tool a name.' }, { status: 400 });
  const icon = ICON_NAMES.includes(String(form!.get('icon'))) ? String(form!.get('icon')) : 'grid';
  const toolId = randomUUID();
  const path = `tools/${id}/${toolId}/index.html`;
  const sb = adminClient();
  const { error } = await sb.storage.from(TOOL_BUCKET).upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: 'text/html', upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { count } = await sb.from('tools').select('id', { count: 'exact', head: true }).eq('project_id', id);
  const { error: e2 } = await sb.from('tools').insert({ id: toolId, project_id: id, kind: 'html', name, icon, description: String(form!.get('description') || '').slice(0, 300), html_path: path, styling: ['full', 'light', 'none'].includes(String(form!.get('styling'))) ? String(form!.get('styling')) : 'full', ai_enabled: form!.get('ai') !== 'false', ord: count || 1, created_by: st.user.id });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ tools: await listTools(id, true) });
}
