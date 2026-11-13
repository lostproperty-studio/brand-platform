import { cache } from 'react';
import { cookies } from 'next/headers';
import { signMany, signOne } from '@/lib/storage/signed';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { buildSnapshot, projectBySlug, publishedSnapshot } from '@/lib/projects/snapshot';
import { readFonts, signFontUrls } from '@/lib/projects/fonts';
import { fontFaceCss, type ProjectFont } from '@/lib/fonts';
import type { Snapshot } from '@/lib/ai/project';
import { pickLogo, sidebarChoice, withFigmaLogos } from '@/lib/portal/logo';
import { avatarSvgs, pickAvatarLogos } from '@/lib/portal/generated';

export type KitFileRow = { path: string; format: string; storage_path: string | null; part: string; partStatus: string };

// Everything a portal page needs, loaded once per request. Studio staff see the working copy (a live preview);
// clients see the last published version only.
export const portalContext = cache(async (slug: string) => {
  const p = await projectBySlug(slug);
  if (!p) return null;
  const acc = await requireProjectAccess(p.id);
  if (acc instanceof Response) return null;
  // Studio staff can switch to seeing it exactly as a client does: the published version, with clients' rules
  const asClient = acc.staff && (await cookies()).get('lp-as-client')?.value === p.slug;
  const preview = acc.staff && !asClient;
  const snap: Snapshot | null = preview ? await buildSnapshot(p.id) : await publishedSnapshot(p.id);
  const { fonts } = await readFonts(p.id);
  const fontCss = fontFaceCss(fonts, await signFontUrls(fonts, 6 * 3600));
  const sb = adminClient();
  const { data: parts } = await sb.from('deliverable_parts').select('key, status, visible, deliverable_files(path, format, storage_path)').eq('project_id', p.id).order('ord');
  const kit: KitFileRow[] = (parts || []).filter((d) => preview || d.visible).flatMap((d) => ((d.deliverable_files || []) as Omit<KitFileRow, 'part' | 'partStatus'>[]).map((f) => ({ ...f, part: d.key as string, partStatus: d.status as string })));
  // Logos imported from Figma replace the kit's
  const files = withFigmaLogos(kit, p.content, { format: 'svg', part: 'assets', partStatus: 'ready' });
  const logoFile = pickLogo(files).main;
  const sign = async (f?: { storage_path: string | null }) => (f?.storage_path ? (await signOne('kits', f.storage_path, 6 * 3600)).data?.signedUrl ?? null : null);
  const logoUrl = await sign(logoFile);
  // The sidebar: the studio's chosen full and small logos; the small one falls back to the social avatar
  const pickd = sidebarChoice(p.content);
  const byPath = (path?: string) => (path ? files.find((f) => f.path === path && f.storage_path) : undefined);
  const fullUrl = (await sign(byPath(pickd.full))) || logoUrl;
  let miniUrl = await sign(byPath(pickd.mini));
  if (!miniUrl) miniUrl = await avatarUrl(files, p.client, snap?.colours || []).catch(() => null);
  return { project: p, access: acc, preview, asClient, snap, fonts: fonts as ProjectFont[], fontCss, files, logoUrl, sidebar: { full: fullUrl, mini: miniUrl } };
});

export type PortalCtx = NonNullable<Awaited<ReturnType<typeof portalContext>>>;

/** Signed URLs for guideline frame images (private bucket), in one request. */
export async function signFrames(paths: string[], seconds = 6 * 3600) {
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await signMany('previews', paths, seconds);
  return Object.fromEntries((data || []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]));
}

/** A download link for a kit file, only when its part is marked Ready (or for the studio). Goes through the logged download route. */
export async function downloadUrl(f: KitFileRow, preview: boolean, slug?: string) {
  if (!f.storage_path || (!preview && f.partStatus !== 'ready')) return null;
  if (slug) return `/api/p/${slug}/download?path=${encodeURIComponent(f.path)}`;
  return (await adminClient().storage.from('kits').createSignedUrl(f.storage_path, 3600, { download: f.path.split('/').pop() })).data?.signedUrl ?? null;
}

export const chapterNum = (i: number) => String(i + 1).padStart(2, '0');

export const chapterSlug = (id: string) => id.replace(/[:;]/g, '-');

/** The first social avatar, as the platform makes it (the symbol in the brand's lead colour), for the small sidebar */
export async function avatarUrl(files: KitFileRow[], client: string, colours: { name: string; hex: string }[]) {
  if (!colours.length) return null;
  const pick = pickAvatarLogos(files.map((f) => f.path));
  const sb = adminClient();
  const text = async (path?: string) => { const f = path ? files.find((x) => x.path === path) : undefined; if (!f?.storage_path) return undefined; const { data } = await sb.storage.from('kits').download(f.storage_path); return data ? await data.text() : undefined; };
  const any = await text(pick.any);
  if (!any) return null;
  const first = Object.values(avatarSvgs(client, colours, { any, light: await text(pick.light), dark: await text(pick.dark) }))[0];
  return first ? 'data:image/svg+xml;base64,' + Buffer.from(first).toString('base64') : null;
}
