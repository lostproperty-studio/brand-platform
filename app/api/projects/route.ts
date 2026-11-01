import { RESERVED, slugify } from '@/lib/slugs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { parseFigmaUrl } from '@/lib/figma/scan';

const Body = z.object({ client: z.string().min(1).max(120), name: z.string().max(120).optional(), line: z.string().max(300).optional(), figmaUrl: z.string().max(500).optional(), tier: z.enum(['essentials', 'standard', 'comprehensive']).optional() });

// Creates a project. Its address is the client's name (brand.lostproperty.studio/tileyard); a short suffix is added
// only if that name is taken. Portals still need a sign-in, so the address being guessable doesn't expose anything.
export async function POST(req: Request) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Add a client name.' }, { status: 400 });
  const fig = b.data.figmaUrl ? parseFigmaUrl(b.data.figmaUrl) : null;
  if (b.data.figmaUrl && !fig) return NextResponse.json({ error: 'That isn’t a Figma file link.' }, { status: 400 });
  const base = slugify(b.data.client);
  const { data: taken } = await adminClient().from('projects').select('slug').eq('slug', base).maybeSingle();
  const slug = taken || RESERVED.has(base) ? `${base}-${randomBytes(2).toString('hex')}` : base;
  const { data, error } = await adminClient().from('projects').insert({ client: b.data.client.trim(), name: b.data.name?.trim() || 'Brand Guide', line: b.data.line?.trim() || '', slug, figma_key: fig?.key ?? null, figma_page_id: fig?.nodeId ?? null, created_by: st.user.id, content: b.data.tier ? { tier: b.data.tier } : {} }).select('id, slug').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
