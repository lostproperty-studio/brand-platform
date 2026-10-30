import { adminClient } from '@/lib/supabase/server';
import type { ProjectFont } from '@/lib/fonts';

export const FONT_BUCKET = 'uploads';

type LegacyFont = Partial<ProjectFont> & { licence?: string };

/** Reads the project's typefaces, upgrading the older shape (name + licence text, no files). */
export async function readFonts(projectId: string): Promise<{ fonts: ProjectFont[]; brand: Record<string, unknown> }> {
  const { data, error } = await adminClient().from('projects').select('brand').eq('id', projectId).single();
  if (error) throw error;
  const brand = (data.brand || {}) as Record<string, unknown>;
  const raw = (brand.fonts || []) as LegacyFont[];
  const fonts = raw.map((f) => ({ role: f.role || 'body', label: f.label || '', name: f.name || '', licenceNote: f.licenceNote ?? f.licence ?? '', files: f.files || [] }));
  return { fonts, brand };
}

export async function writeFonts(projectId: string, brand: Record<string, unknown>, fonts: ProjectFont[]) {
  const { error } = await adminClient().from('projects').update({ brand: { ...brand, fonts } }).eq('id', projectId);
  if (error) throw error;
}

/** Signed URLs for every font file, for previews and the portal. */
export async function signFontUrls(fonts: ProjectFont[], seconds = 3600) {
  const paths = fonts.flatMap((f) => f.files.map((x) => x.path));
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await adminClient().storage.from(FONT_BUCKET).createSignedUrls(paths, seconds);
  return Object.fromEntries((data || []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]));
}
