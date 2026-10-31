import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';
import { logActivity } from '@/lib/activity';

// Team files: managers and admins upload and replace files everyone on the team can download.
async function teamPart(projectId: string) {
  const sb = adminClient();
  const { data } = await sb.from('deliverable_parts').select('id').eq('project_id', projectId).eq('key', 'team').maybeSingle();
  if (data) return data.id as string;
  const { data: c } = await sb.from('deliverable_parts').insert({ project_id: projectId, key: 'team', ord: 99, title: 'Team files', contains: 'Files your team has added: photography, presentations, signed-off artwork.', format: 'Any', status: 'ready', visible: true }).select('id').single();
  return c!.id as string;
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const p = await projectBySlug((await ctx.params).slug); if (!p) return new Response('Not found', { status: 404 });
  const acc = await requireProjectAccess(p.id); if (acc instanceof Response) return acc;
  if (!acc.canManage) return NextResponse.json({ error: 'Only managers and admins can upload files.' }, { status: 403 });
  const file = (await req.formData().catch(() => null))?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file received.' }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'Files must be under 4 MB here. For bigger files, ask Lost Property to add them to the kit.' }, { status: 400 });
  const safe = file.name.replace(/[^\w.-]+/g, '-').slice(-120);
  const storagePath = `${p.id}/team/${randomUUID().slice(0, 8)}-${safe}`;
  const sb = adminClient();
  const { error } = await sb.storage.from('kits').upload(storagePath, new Uint8Array(await file.arrayBuffer()), { contentType: file.type || 'application/octet-stream' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const partId = await teamPart(p.id);
  // Same name replaces the earlier file
  const path = `team/${safe}`;
  const { data: old } = await sb.from('deliverable_files').select('storage_path').eq('part_id', partId).eq('path', path).maybeSingle();
  if (old?.storage_path) await sb.storage.from('kits').remove([old.storage_path]);
  await sb.from('deliverable_files').upsert({ part_id: partId, path, format: (safe.split('.').pop() || '').toUpperCase(), storage_path: storagePath, bytes: file.size }, { onConflict: 'part_id,path' });
  if (!acc.staff) await logActivity(p.id, acc.user.id, 'upload', path);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const p = await projectBySlug((await ctx.params).slug); if (!p) return new Response('Not found', { status: 404 });
  const acc = await requireProjectAccess(p.id); if (acc instanceof Response) return acc;
  if (!acc.canManage) return NextResponse.json({ error: 'Only managers and admins can remove files.' }, { status: 403 });
  const path = new URL(req.url).searchParams.get('path') || '';
  if (!path.startsWith('team/')) return NextResponse.json({ error: 'Only team files can be removed here.' }, { status: 400 });
  const sb = adminClient();
  const partId = await teamPart(p.id);
  const { data: f } = await sb.from('deliverable_files').select('storage_path').eq('part_id', partId).eq('path', path).maybeSingle();
  if (f?.storage_path) await sb.storage.from('kits').remove([f.storage_path]);
  await sb.from('deliverable_files').delete().eq('part_id', partId).eq('path', path);
  return NextResponse.json({ ok: true });
}
