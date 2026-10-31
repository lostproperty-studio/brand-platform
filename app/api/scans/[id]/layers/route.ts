import { NextResponse } from 'next/server';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { fetchPage } from '@/lib/figma/scan';

type N = { id: string; name: string; type: string; visible?: boolean; absoluteBoundingBox?: { width: number; height: number } | null; children?: N[] };
const GENERIC = /^(frame|group|rectangle|vector|image|ellipse|line|union|subtract|text|layer|mask)\s*\d*$/i;

// Find layers on the Figma page by name, to add an asset the scan missed.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  const q = (new URL(req.url).searchParams.get('q') || '').trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ layers: [] });
  const { data: scan } = await adminClient().from('scans').select('figma_key, page_id').eq('id', id).single();
  if (!scan) return NextResponse.json({ layers: [] });
  const { root } = await fetchPage(scan.figma_key, scan.page_id);
  const out: { id: string; name: string; type: string; w: number; h: number; slide: string }[] = [];
  const walk = (n: N, slide: string) => {
    if (n.visible === false || out.length >= 30) return;
    if (n.type !== 'TEXT' && !GENERIC.test(n.name) && n.name.toLowerCase().includes(q) && n.absoluteBoundingBox) out.push({ id: n.id, name: n.name, type: n.type, w: Math.round(n.absoluteBoundingBox.width), h: Math.round(n.absoluteBoundingBox.height), slide });
    (n.children || []).forEach((c) => walk(c, slide));
  };
  for (const f of (root as unknown as N).children || []) walk(f, f.name);
  return NextResponse.json({ layers: out });
}
