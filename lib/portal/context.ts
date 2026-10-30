import { cache } from 'react';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { buildSnapshot, projectBySlug, publishedSnapshot } from '@/lib/projects/snapshot';
import { readFonts, signFontUrls } from '@/lib/projects/fonts';
import { fontFaceCss, type ProjectFont } from '@/lib/fonts';
import type { Snapshot } from '@/lib/ai/project';

export type KitFileRow = { path: string; format: string; storage_path: string | null; part: string; partStatus: string };

// Everything a portal page needs, loaded once per request. Studio staff see the working copy (a live preview);
// clients see the last published version only.
export const portalContext = cache(async (slug: string) => {
  const p = await projectBySlug(slug);
  if (!p) return null;
  const acc = await requireProjectAccess(p.id);
  if (acc instanceof Response) return null;
  const preview = acc.staff;
  const snap: Snapshot | null = preview ? await buildSnapshot(p.id) : await publishedSnapshot(p.id);
  const { fonts } = await readFonts(p.id);
  const fontCss = fontFaceCss(fonts, await signFontUrls(fonts, 6 * 3600));
  const sb = adminClient();
  const { data: parts } = await sb.from('deliverable_parts').select('key, status, visible, deliverable_files(path, format, storage_path)').eq('project_id', p.id).order('ord');
  const files: KitFileRow[] = (parts || []).filter((d) => preview || d.visible).flatMap((d) => ((d.deliverable_files || []) as Omit<KitFileRow, 'part' | 'partStatus'>[]).map((f) => ({ ...f, part: d.key as string, partStatus: d.status as string })));
  const logoFile = files.find((f) => /^assets\/logo\/.+\.svg$/.test(f.path) && /dark|black|primary|horizontal|main/i.test(f.path)) || files.find((f) => /^assets\/logo\/.+\.svg$/.test(f.path));
  const logoUrl = logoFile?.storage_path ? (await sb.storage.from('kits').createSignedUrl(logoFile.storage_path, 6 * 3600)).data?.signedUrl ?? null : null;
  return { project: p, access: acc, preview, snap, fonts: fonts as ProjectFont[], fontCss, files, logoUrl };
});

export type PortalCtx = NonNullable<Awaited<ReturnType<typeof portalContext>>>;

/** Signed URLs for guideline frame images (private bucket), in one request. */
export async function signFrames(paths: string[], seconds = 6 * 3600) {
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await adminClient().storage.from('previews').createSignedUrls(paths, seconds);
  return Object.fromEntries((data || []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]));
}

/** A download link for a kit file, only when its part is marked Ready (or for the studio). */
export async function downloadUrl(f: KitFileRow, preview: boolean) {
  if (!f.storage_path || (!preview && f.partStatus !== 'ready')) return null;
  return (await adminClient().storage.from('kits').createSignedUrl(f.storage_path, 3600, { download: f.path.split('/').pop() })).data?.signedUrl ?? null;
}

export const chapterNum = (i: number) => String(i + 1).padStart(2, '0');

export const chapterSlug = (id: string) => id.replace(/[:;]/g, '-');
