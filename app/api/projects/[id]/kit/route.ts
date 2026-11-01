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
  const result = await commitKit(repo, files, `Kit v${input.version}: generated from Figma and the review`, { asPullRequest: !!p?.repo_full_name && searchParams.get('direct') !== '1' });

  // Deliverables: parts + files (copied to storage so the portal can serve downloads to members)
  for (const [ord, [key, title, contains, format]] of PARTS.entries()) await sb.from('deliverable_parts').upsert({ project_id: id, ord, key, title, contains, format }, { onConflict: 'project_id,key' });
  const { data: parts } = await sb.from('deliverable_parts').select('id, key').eq('project_id', id);
  const partId = Object.fromEntries((parts || []).map((x) => [x.key, x.id]));
  for (const f of files) {
    const part = f.part === 'root' ? 'guidelines' : f.part;
    const storagePath = `${id}/${input.version}/${f.path}`;
    const body = typeof f.content === 'string' ? new TextEncoder().encode(f.content) : f.content;
    await sb.storage.from('kits').upload(storagePath, body, { upsert: true, contentType: /\.(woff2?|otf|ttf)$/.test(f.path) ? 'font/' + f.path.split('.').pop() : f.path.endsWith('.svg') ? 'image/svg+xml' : f.path.endsWith('.png') ? 'image/png' : f.path.endsWith('.json') ? 'application/json' : f.path.endsWith('.html') ? 'text/html' : 'text/plain' });
    await sb.from('deliverable_files').upsert({ part_id: partId[part], path: f.path, format: f.path.split('.').pop()?.toUpperCase() || '', storage_path: storagePath, bytes: body.byteLength }, { onConflict: 'part_id,path' });
  }
  return NextResponse.json({ repo, commit: result.commit, pullRequest: result.pr, files: files.length });
}
