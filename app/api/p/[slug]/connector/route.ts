import { appOrigin } from '@/lib/origin';
import { NextResponse } from 'next/server';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';
import { hashToken, newToken } from '@/lib/crypto';
import { env } from '@/lib/env';

// Route 3: issues (or rotates) the token a client uses to add this kit as a connector in their own Claude.
// The token is shown once; only its hash is stored.
export async function POST(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const p = await projectBySlug(slug);
  if (!p) return new Response('Not found', { status: 404 });
  const acc = await requireProjectAccess(p.id);
  if (acc instanceof Response) return acc;
  if (!acc.clientAdmin) return new Response('Only a client admin can create the connector', { status: 403 });
  const token = newToken();
  await adminClient().from('projects').update({ mcp_token_hash: hashToken(token) }).eq('id', p.id);
  return NextResponse.json({ url: `${await appOrigin()}/api/mcp/${slug}?token=${token}`, note: 'Add this URL in Claude as a custom connector. Anyone with it can read the published kit, so treat it like a password. Rotating it here stops the old one.' });
}
