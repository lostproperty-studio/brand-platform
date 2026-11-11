import { validSlug } from '@/lib/slugs';
import { teamGate } from '@/lib/studioTeam';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { deleteKitRepo } from '@/lib/github/kitRepo';
import { parseFigmaUrl } from '@/lib/figma/scan';
import { readSources, sourceFromUrl, type Sources } from '@/lib/figma/sources';

const Body = z.object({ client: z.string().max(120).optional(), name: z.string().max(120).optional(), line: z.string().max(300).optional(), status: z.enum(['draft', 'live', 'archived']).optional(), brand: z.record(z.unknown()).optional(), content: z.record(z.unknown()).optional(), kit_version: z.string().max(20).optional(), figmaUrl: z.string().max(500).optional(), tier: z.enum(['essentials', 'standard', 'comprehensive']).optional(), slug: z.string().max(48).optional(), sources: z.object({ assets: z.string().max(500).nullable().optional(), guidelines: z.string().max(500).nullable().optional() }).optional() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'project'); if (gate) return gate; }
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { figmaUrl, tier, content, sources, ...rest } = b.data;
  const { slug, ...fields } = rest;
  const update: Record<string, unknown> = { ...fields };
  // The portal address: platform.lostproperty.studio/<slug>
  if (slug !== undefined) {
    const s = slug.trim().toLowerCase();
    if (!validSlug(s)) return NextResponse.json({ error: 'Use lowercase letters, numbers and hyphens (and not a word the platform uses, like studio or login).' }, { status: 400 });
    const { data: other } = await adminClient().from('projects').select('id').eq('slug', s).neq('id', id).maybeSingle();
    if (other) return NextResponse.json({ error: 'Another project already uses that address.' }, { status: 409 });
    update.slug = s;
  }
  // Content is merged key by key, so saving the guide never wipes the tier or other settings
  if (content || tier) {
    const { data: cur } = await adminClient().from('projects').select('content').eq('id', id).maybeSingle();
    const was = (cur?.content as Record<string, unknown>) || {};
    update.content = { ...was, ...(content || {}), ...(tier ? { tier } : {}) };
    // A whole guide saved this way still moves the revision on, so live editors' saves notice it
    if (content?.guide && typeof content.guide === 'object') (update.content as { guide: { _rev?: number } }).guide = { ...(content.guide as object), _rev: (((was.guide as { _rev?: number }) || {})._rev || 0) + 1 };
  }
  // The two Figma links: brand assets, and guidelines. The guidelines link is also the project's main Figma file.
  const changed: Record<string, { otherFile: boolean; file?: string; page?: string }> = {};
  if (sources) {
    const { data: cur } = await adminClient().from('projects').select('content, figma_key, figma_page_id').eq('id', id).maybeSingle();
    const base = (update.content as Record<string, unknown>) || (cur?.content as Record<string, unknown>) || {};
    const now = readSources(base, cur || undefined);
    const next: Sources = { ...now };
    for (const k of ['assets', 'guidelines'] as const) {
      const v = sources[k];
      if (v === undefined) continue;
      if (v === null || !v.trim()) { delete next[k]; continue; }
      if (now[k]?.url === v.trim()) continue;
      try { next[k] = await sourceFromUrl(v.trim(), k); changed[k] = { otherFile: (now[k] || (k === 'assets' ? now.guidelines : undefined))?.key !== next[k]!.key, file: next[k]!.file, page: next[k]!.pageName }; } catch (e) { return NextResponse.json({ error: (e as Error).message || 'Couldn’t open that Figma link.' }, { status: 400 }); }
    }
    update.content = { ...base, sources: next };
    if (sources.guidelines !== undefined) { update.figma_key = next.guidelines?.key || null; update.figma_page_id = next.guidelines?.page || null; }
  }
  if (figmaUrl) {
    const fig = parseFigmaUrl(figmaUrl);
    if (!fig) return NextResponse.json({ error: 'That isn’t a Figma file link.' }, { status: 400 });
    update.figma_key = fig.key; update.figma_page_id = fig.nodeId;
  }
  const { error } = await adminClient().from('projects').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...(Object.keys(changed).length ? { changed } : {}) });
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
  { const gate = await teamGate(id, st, 'lead', 'project'); if (gate) return gate; }
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
