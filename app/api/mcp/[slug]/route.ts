import { timingSafeEqual } from 'node:crypto';
import { projectBySlug, publishedSnapshot } from '@/lib/projects/snapshot';
import { hashToken } from '@/lib/crypto';
import { appOrigin } from '@/lib/origin';
import { callTool, INSTRUCTIONS, TOOLS } from '@/lib/mcp/tools';
import { loadKit } from '@/lib/mcp/kit';

// Minimal stateless MCP server (Streamable HTTP, JSON responses) exposing one published kit, read-only.
type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> };
const reply = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });
const fail = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function authorised(req: Request, slug: string) {
  const p = await projectBySlug(slug);
  if (!p?.mcp_token_hash) return null;
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const a = Buffer.from(hashToken(token)), b = Buffer.from(p.mcp_token_hash);
  return a.length === b.length && timingSafeEqual(a, b) ? p : null;
}

// Images are resized and sent inline, which can take a few seconds for a chapter
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const p = await authorised(req, slug);
  if (!p) return new Response('Unauthorized', { status: 401 });
  const msg = (await req.json().catch(() => null)) as Rpc | Rpc[] | null;
  if (!msg) return Response.json(fail(null, -32700, 'Parse error'), { status: 400 });
  const handle = async (m: Rpc) => {
    if (m.id === undefined) return null; // notification
    switch (m.method) {
      case 'initialize': return reply(m.id, { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: `${p.client} brand kit`, version: '1.0.0' }, instructions: INSTRUCTIONS(p.client) });
      case 'ping': return reply(m.id, {});
      case 'tools/list': return reply(m.id, { tools: TOOLS });
      case 'tools/call': {
        const snap = await publishedSnapshot(p.id);
        if (!snap) return fail(m.id, -32000, 'The kit has not been published yet.');
        const kit = await loadKit({ id: p.id, slug, client: p.client, content: p.content, mcp_token_hash: p.mcp_token_hash! }, snap, await appOrigin());
        try { return reply(m.id, { content: await callTool(String(m.params?.name), (m.params?.arguments as Record<string, unknown>) || {}, kit) }); }
        catch (e) { return reply(m.id, { content: [{ type: 'text', text: (e as Error).message }], isError: true }); }
      }
      default: return fail(m.id, -32601, 'Method not found');
    }
  };
  if (Array.isArray(msg)) { const out = (await Promise.all(msg.map(handle))).filter(Boolean); return out.length ? Response.json(out) : new Response(null, { status: 202 }); }
  const out = await handle(msg);
  return out ? Response.json(out) : new Response(null, { status: 202 });
}

export async function GET() { return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } }); }
