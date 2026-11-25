import { projectBySlug, publishedSnapshot } from '@/lib/projects/snapshot';
import { adminClient } from '@/lib/supabase/server';
import { linkOk, LINK_KINDS, type LinkKind } from '@/lib/mcp/links';
import { linkTarget } from '@/lib/mcp/kit';

// Stable links to the connector's files: /api/mcp/<slug>/file/<kind>/<sig>/<path>. No sign-in; the signature (keyed
// on the connector token's hash) is the permission, and what it points at must still be in the published kit.
const TYPES: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', pdf: 'application/pdf', json: 'application/json', md: 'text/markdown; charset=utf-8', txt: 'text/plain; charset=utf-8', woff2: 'font/woff2', woff: 'font/woff', otf: 'font/otf', ttf: 'font/ttf' };

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; path: string[] }> }) {
  const { slug, path: parts } = await ctx.params;
  const [kind, sig, ...rest] = parts || [];
  const path = rest.join('/');
  if (!LINK_KINDS.includes(kind as LinkKind) || !sig || !path) return new Response('Not found', { status: 404 });
  const p = await projectBySlug(slug);
  if (!p?.mcp_token_hash || !linkOk(p.mcp_token_hash, slug, kind as LinkKind, path, sig)) return new Response('Not found', { status: 404 });
  const snap = kind === 'img' ? await publishedSnapshot(p.id) : null;
  const at = await linkTarget({ id: p.id, slug, client: p.client, content: p.content, mcp_token_hash: p.mcp_token_hash }, snap, kind as LinkKind, path);
  if (!at) return new Response('This file is no longer in the published kit.', { status: 410 });
  const { data } = await adminClient().storage.from(at.bucket).download(at.path);
  if (!data) return new Response('Not found', { status: 404 });
  const name = path.split('/').pop() || 'file';
  const ext = (name.split('.').pop() || '').toLowerCase();
  return new Response(data.stream(), { headers: {
    'Content-Type': TYPES[ext] || data.type || 'application/octet-stream',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    // Files are shown as files, never run as pages on the platform's address (an SVG can carry script)
    'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"
  } });
}
