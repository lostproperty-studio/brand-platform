import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';
import { encryptSecret } from '@/lib/crypto';
import { verifyAnthropicKey } from '@/lib/ai/project';

// Route 1: a client admin connects their own Anthropic key. It is checked, encrypted and never sent back.
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const p = await projectBySlug(slug);
  if (!p) return new Response('Not found', { status: 404 });
  const acc = await requireProjectAccess(p.id);
  if (acc instanceof Response) return acc;
  if (!acc.clientAdmin) return new Response('Only a client admin can connect AI', { status: 403 });
  const body = z.object({ apiKey: z.string().min(20).max(300) }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: 'Paste a valid Anthropic API key.' }, { status: 400 });
  try { await verifyAnthropicKey(body.data.apiKey); } catch { return NextResponse.json({ error: 'Anthropic didn’t accept that key. Check it in the Anthropic Console and try again.' }, { status: 400 }); }
  await adminClient().from('projects').update({ ai_provider: 'anthropic', ai_key_cipher: encryptSecret(body.data.apiKey), ai_key_hint: body.data.apiKey.slice(-4) }).eq('id', p.id);
  return NextResponse.json({ connected: true, hint: body.data.apiKey.slice(-4) });
}

export async function DELETE(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const p = await projectBySlug(slug);
  if (!p) return new Response('Not found', { status: 404 });
  const acc = await requireProjectAccess(p.id);
  if (acc instanceof Response) return acc;
  if (!acc.clientAdmin) return new Response('Only a client admin can disconnect AI', { status: 403 });
  await adminClient().from('projects').update({ ai_provider: null, ai_key_cipher: null, ai_key_hint: null }).eq('id', p.id);
  return NextResponse.json({ connected: false });
}
