import { adminClient } from '@/lib/supabase/server';
import { readFonts, signFontUrls } from '@/lib/projects/fonts';
import { fontFaceCss } from '@/lib/fonts';
import { normaliseGuide, type Guide } from '@/lib/portal/guide';

export type LoginLook = { style: 'client' | 'lp'; background: 'light' | 'dark' | 'brand'; message: string };
export const DEFAULT_LOOK: LoginLook = { style: 'client', background: 'light', message: '' };

/** What a client's sign-in screen needs: name, logo, colours, fonts and the studio's chosen look. No sign-in required to read it. */
export async function projectBranding(slug: string) {
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('id, client, slug, brand, content').eq('slug', slug).maybeSingle();
  if (!p) return null;
  const content = (p.content || {}) as { login?: Partial<LoginLook>; guide?: Guide };
  const look: LoginLook = { ...DEFAULT_LOOK, ...(content.login || {}) };
  const brand = (p.brand || {}) as { core?: { name: string; hex: string }[] };
  const colours = brand.core?.length ? brand.core : normaliseGuide(content.guide)?.colours || [];
  const { data: logos } = await sb.from('deliverable_files').select('path, storage_path, deliverable_parts!inner(project_id)').eq('deliverable_parts.project_id', p.id).like('path', 'assets/logo/%.svg');
  // The built kit's logos first; before a kit exists, the logos package imported from the Figma assets page
  const pkgLogos = (((content as { packages?: Record<string, { files?: { path: string; type: string }[] }> }).packages?.logos?.files) || []).filter((f) => /svg|png/.test(f.type)).map((f) => ({ path: f.path, storage_path: f.path }));
  const list = logos?.length ? logos : pkgLogos;
  const pick = list.find((l) => /dark|black|primary|horizontal|main/i.test(l.path)) || list.find((l) => !/white|light|reverse|negative/i.test(l.path)) || list[0];
  const light = list.find((l) => /white|light|reverse|negative/i.test(l.path));
  const sign = async (x?: { storage_path: string | null } | null) => (x?.storage_path ? (await sb.storage.from('kits').createSignedUrl(x.storage_path, 6 * 3600)).data?.signedUrl ?? null : null);
  const { fonts } = await readFonts(p.id);
  const display = fonts.find((f) => f.role === 'display' && f.files.length) || fonts.find((f) => f.files.length);
  return { id: p.id as string, client: p.client as string, slug: p.slug as string, look, colours, logoUrl: await sign(pick), logoLightUrl: await sign(light), fontCss: fontFaceCss(fonts, await signFontUrls(fonts, 6 * 3600)), displayFont: display ? `var(--font-${display.role})` : null };
}
export type Branding = NonNullable<Awaited<ReturnType<typeof projectBranding>>>;
