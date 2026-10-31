import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';

// Requests from client admins to Lost Property: edits, new assets, hosting on their own domain, access, other.
export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const p = await projectBySlug((await ctx.params).slug); if (!p) return new Response('Not found', { status: 404 });
  const acc = await requireProjectAccess(p.id); if (acc instanceof Response) return acc;
  if (!acc.clientAdmin) return new Response('Admins only', { status: 403 });
  const { data } = await adminClient().from('requests').select('id, kind, title, details, status, reply, email, created_at, updated_at').eq('project_id', p.id).order('created_at', { ascending: false });
  return NextResponse.json({ requests: data || [] });
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const p = await projectBySlug((await ctx.params).slug); if (!p) return new Response('Not found', { status: 404 });
  const acc = await requireProjectAccess(p.id); if (acc instanceof Response) return acc;
  if (!acc.clientAdmin) return NextResponse.json({ error: 'Only admins can send requests.' }, { status: 403 });
  const b = z.object({ kind: z.enum(['edit', 'asset', 'domain', 'access', 'other']), title: z.string().min(3).max(140), details: z.string().max(4000).default('') }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Give the request a short title.' }, { status: 400 });
  await adminClient().from('requests').insert({ project_id: p.id, user_id: acc.user.id, email: acc.user.email, ...b.data });
  const { data } = await adminClient().from('requests').select('id, kind, title, details, status, reply, email, created_at, updated_at').eq('project_id', p.id).order('created_at', { ascending: false });
  return NextResponse.json({ requests: data || [] });
}
