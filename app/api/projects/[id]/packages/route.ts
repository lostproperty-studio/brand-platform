import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { packageSettings, type PackageMap } from '@/lib/portal/packages';

// The studio's control of resource packages: upload files (straight to storage with a signed link, so size isn't
// limited by the server), set a cover, rename, hide, switch on drafted spaces, and add custom packages.

const safe = (s: string) => s.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(0, 120) || 'file';
const Pkg = z.string().regex(/^(logos|colours|fonts|avatars|icons|images|graphics|tokens|guidelines|templates|team|custom-[a-z0-9]{4,12})$/);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sign'), pkg: Pkg, name: z.string().max(200), cover: z.boolean().optional() }),
  z.object({ action: z.literal('add'), pkg: Pkg, name: z.string().max(200), path: z.string().max(400), bytes: z.number(), type: z.string().max(100), cover: z.boolean().optional() }),
  z.object({ action: z.literal('custom'), title: z.string().min(1).max(80), purpose: z.string().max(300).optional() }),
  z.object({ action: z.literal('patch'), pkg: Pkg, title: z.string().max(80).optional(), purpose: z.string().max(300).optional(), hidden: z.boolean().optional(), enabled: z.boolean().optional() }),
  z.object({ action: z.literal('remove-file'), pkg: Pkg, name: z.string().max(200) }),
  z.object({ action: z.literal('remove-cover'), pkg: Pkg }),
  z.object({ action: z.literal('remove-package'), pkg: Pkg })
]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const sb = adminClient();
  const d = b.data;

  if (d.action === 'sign') {
    const path = `${id}/packages/${d.pkg}/${d.cover ? 'cover-' + Date.now().toString(36) + '-' : ''}${safe(d.name)}`;
    const { data, error } = await sb.storage.from('kits').createSignedUploadUrl(path, { upsert: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ path, signedUrl: data.signedUrl });
  }

  const { data: p } = await sb.from('projects').select('content').eq('id', id).single();
  const content = (p?.content || {}) as Record<string, unknown>;
  const pkgs: PackageMap = { ...packageSettings(content) };
  const cur = { ...(pkgs[('pkg' in d ? d.pkg : '') as string] || {}) };
  let created: string | undefined;

  if (d.action === 'add') {
    if (!d.path.startsWith(`${id}/packages/${d.pkg}/`)) return NextResponse.json({ error: 'Bad path' }, { status: 400 });
    if (d.cover) cur.cover = d.path;
    else cur.files = [...(cur.files || []).filter((f) => f.name !== safe(d.name)), { name: safe(d.name), path: d.path, bytes: d.bytes, type: d.type }];
    if (!d.cover && ['icons', 'images', 'graphics'].includes(d.pkg)) cur.enabled = true;
    pkgs[d.pkg] = cur;
  }
  if (d.action === 'custom') { created = 'custom-' + Math.random().toString(36).slice(2, 9); pkgs[created] = { title: d.title, purpose: d.purpose || '', enabled: true }; }
  if (d.action === 'patch') { for (const k of ['title', 'purpose', 'hidden', 'enabled'] as const) if (d[k] !== undefined) (cur as Record<string, unknown>)[k] = d[k]; pkgs[d.pkg] = cur; }
  if (d.action === 'remove-file') { const f = (cur.files || []).find((x) => x.name === d.name); if (f) await sb.storage.from('kits').remove([f.path]); cur.files = (cur.files || []).filter((x) => x.name !== d.name); pkgs[d.pkg] = cur; }
  if (d.action === 'remove-cover') { if (cur.cover) await sb.storage.from('kits').remove([cur.cover]); delete cur.cover; pkgs[d.pkg] = cur; }
  if (d.action === 'remove-package') {
    const paths = [...(cur.files || []).map((f) => f.path), ...(cur.cover ? [cur.cover] : [])];
    if (paths.length) await sb.storage.from('kits').remove(paths);
    if (d.pkg.startsWith('custom-')) delete pkgs[d.pkg]; else pkgs[d.pkg] = { enabled: false };
  }
  const { error } = await sb.from('projects').update({ content: { ...content, packages: pkgs } }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, created });
}
