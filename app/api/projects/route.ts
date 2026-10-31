import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { parseFigmaUrl } from '@/lib/figma/scan';

const Body = z.object({ client: z.string().min(1).max(120), name: z.string().max(120).optional(), line: z.string().max(300).optional(), figmaUrl: z.string().max(500).optional(), tier: z.enum(['essentials', 'standard', 'comprehensive']).optional() });
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client';

// Creates a project. The slug carries a random suffix so portal links can't be guessed.
export async function POST(req: Request) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Add a client name.' }, { status: 400 });
  const fig = b.data.figmaUrl ? parseFigmaUrl(b.data.figmaUrl) : null;
  if (b.data.figmaUrl && !fig) return NextResponse.json({ error: 'That isn’t a Figma file link.' }, { status: 400 });
  const slug = `${slugify(b.data.client)}-${randomBytes(3).toString('hex')}`;
  const { data, error } = await adminClient().from('projects').insert({ client: b.data.client.trim(), name: b.data.name?.trim() || 'Brand Guide', line: b.data.line?.trim() || '', slug, figma_key: fig?.key ?? null, figma_page_id: fig?.nodeId ?? null, created_by: st.user.id, content: b.data.tier ? { tier: b.data.tier } : {} }).select('id, slug').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
