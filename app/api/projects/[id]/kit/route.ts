import { teamGate } from '@/lib/studioTeam';
import { NextResponse } from 'next/server';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { buildKit } from '@/lib/kit/build';
import { attachAssetBytes, kitInputFor } from '@/lib/kit/fromProject';
import { commitKit, ensureKitRepo } from '@/lib/github/kitRepo';

export const maxDuration = 300;

const PARTS = [
  ['assets', 'Assets', 'Every logo lockup and colourway, icons, patterns and key imagery. Fonts with their licence.', 'SVG and PNG; font files'],
  ['tokens', 'Design tokens', 'Colours, type sizes, spacing and other brand values, as numbers.', 'JSON · W3C Design Tokens'],
  ['guidelines', 'Guidelines', 'The rules: logo, colour, type, layout, imagery and tone of voice.', 'Markdown (.md)'],
  ['templates', 'Templates', 'Ready-made layouts. Logo and layout fixed; copy and image as editable slots.', 'HTML and CSS'],
  ['reference', 'Reference copies', 'A browsable web version of the guidelines and a PDF snapshot.', 'HTML page and PDF']
] as const;

// Generates the kit, commits it to the project's repository and refreshes the Deliverables files.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'kit'); if (gate) return gate; }
  const sb = adminClient();
  const { input, figmaKey } = await kitInputFor(id);
  if (figmaKey) await attachAssetBytes(input, figmaKey);
  const files = buildKit(input);

  const { data: p } = await sb.from('projects').select('repo_full_name').eq('id', id).single();
  const repo = p?.repo_full_name || await ensureKitRepo(input.slug, input.client);
  if (!p?.repo_full_name) await sb.from('projects').update({ repo_full_name: repo }).eq('id', id);
  const { searchParams } = new URL(req.url);
  // The asset folders are rebuilt whole, so files the new artwork doesn't have are removed from the repository too
  const result = await commitKit(repo, files, searchParams.get('reason') === 'assets' ? `Kit v${input.version}: assets updated from Figma` : `Kit v${input.version}: generated from Figma and the review`, { asPullRequest: !!p?.repo_full_name && searchParams.get('direct') !== '1', prune: ['assets/'] });

  // Deliverables: parts + files (copied to storage so the portal can serve downloads to members)
  for (const [ord, [key, title, contains, format]] of PARTS.entries()) await sb.from('deliverable_parts').upsert({ project_id: id, ord, key, title, contains, format }, { onConflict: 'project_id,key' });
  const { data: parts } = await sb.from('deliverable_parts').select('id, key').eq('project_id', id);
  const partId = Object.fromEntries((parts || []).map((x) => [x.key, x.id]));
  // Each build stores its files in a folder of its own, so downloads never serve a cached copy of an older build
  const stamp = Date.now().toString(36);
  const { data: before } = await sb.from('deliverable_files').select('id, path, storage_path, deliverable_parts!inner(project_id)').eq('deliverable_parts.project_id', id);
  for (const f of files) {
    const part = f.part === 'root' ? 'guidelines' : f.part;
    const storagePath = `${id}/${input.version}/${stamp}/${f.path}`;
    const body = typeof f.content === 'string' ? new TextEncoder().encode(f.content) : f.content;
    await sb.storage.from('kits').upload(storagePath, body, { upsert: true, contentType: /\.(woff2?|otf|ttf)$/.test(f.path) ? 'font/' + f.path.split('.').pop() : f.path.endsWith('.svg') ? 'image/svg+xml' : f.path.endsWith('.png') ? 'image/png' : f.path.endsWith('.json') ? 'application/json' : f.path.endsWith('.html') ? 'text/html' : 'text/plain' });
    await sb.from('deliverable_files').upsert({ part_id: partId[part], path: f.path, format: f.path.split('.').pop()?.toUpperCase() || '', storage_path: storagePath, bytes: body.byteLength }, { onConflict: 'part_id,path' });
  }
  // Files the new build doesn't have: their download rows and stored copies go; so do older copies of the ones it does
  const made = new Set(files.map((f) => f.path));
  const old = ((before || []) as { id: string; path: string; storage_path: string | null }[]);
  const goneRows = old.filter((r) => !made.has(r.path));
  if (goneRows.length) await sb.from('deliverable_files').delete().in('id', goneRows.map((r) => r.id));
  const oldStorage = old.map((r) => r.storage_path).filter((x): x is string => !!x && !x.includes(`/${stamp}/`));
  for (let i = 0; i < oldStorage.length; i += 100) await sb.storage.from('kits').remove(oldStorage.slice(i, i + 100));
  // After an assets import, the import's report says what happened to the repository too
  if (searchParams.get('reason') === 'assets') {
    const { data: cur } = await sb.from('projects').select('content').eq('id', id).single();
    const c = (cur?.content || {}) as { assetsReport?: Record<string, unknown> };
    if (c.assetsReport) await sb.from('projects').update({ content: { ...c, assetsReport: { ...c.assetsReport, kit: { repo, files: input.assets.length, removed: result.removed, commit: result.commit } } } }).eq('id', id);
  }
  return NextResponse.json({ repo, commit: result.commit, pullRequest: result.pr, files: files.length, assets: input.assets.length, removed: result.removed, removedDownloads: goneRows.length });
}
