import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { deleteKitRepo } from '@/lib/github/kitRepo';
import { parseFigmaUrl } from '@/lib/figma/scan';

const Body = z.object({ client: z.string().max(120).optional(), name: z.string().max(120).optional(), line: z.string().max(300).optional(), status: z.enum(['draft', 'live', 'archived']).optional(), brand: z.record(z.unknown()).optional(), content: z.record(z.unknown()).optional(), kit_version: z.string().max(20).optional(), figmaUrl: z.string().max(500).optional() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { figmaUrl, ...rest } = b.data;
  const update: Record<string, unknown> = { ...rest };
  if (figmaUrl) {
    const fig = parseFigmaUrl(figmaUrl);
    if (!fig) return NextResponse.json({ error: 'That isn’t a Figma file link.' }, { status: 400 });
    update.figma_key = fig.key; update.figma_page_id = fig.nodeId;
  }
  const { error } = await adminClient().from('projects').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Lists every file under a storage folder (Supabase lists one level at a time). */
async function listAll(bucket: string, prefix: string): Promise<string[]> {
  const sb = adminClient();
  const out: string[] = [];
  const { data } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
  for (const e of data || []) {
    const path = `${prefix}/${e.name}`;
    if (e.id) out.push(path); else out.push(...(await listAll(bucket, path)));
  }
  return out;
}

// Deletes a project: its rows (review, deliverables, versions, members cascade), its stored files,
// and, only if asked, its GitHub repository. Confirmation is the client name, typed exactly.
const Del = z.object({ confirm: z.string(), deleteRepo: z.boolean().default(false) });
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  const b = Del.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('client, repo_full_name').eq('id', id).maybeSingle();
  if (!p) return NextResponse.json({ ok: true });
  if (b.data.confirm.trim().toLowerCase() !== p.client.trim().toLowerCase()) return NextResponse.json({ error: 'Type the client name exactly to confirm.' }, { status: 400 });

  let repo: 'kept' | 'deleted' | 'failed' | 'none' = p.repo_full_name ? 'kept' : 'none';
  if (b.data.deleteRepo && p.repo_full_name) {
    try { await deleteKitRepo(p.repo_full_name); repo = 'deleted'; } catch { repo = 'failed'; }
  }
  for (const [bucket, prefix] of [['previews', id], ['kits', id], ['uploads', `fonts/${id}`]] as const) {
    const paths = await listAll(bucket, prefix).catch(() => []);
    for (let i = 0; i < paths.length; i += 100) await sb.storage.from(bucket).remove(paths.slice(i, i + 100));
  }
  const { error } = await sb.from('projects').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, repo, repoName: p.repo_full_name });
}
