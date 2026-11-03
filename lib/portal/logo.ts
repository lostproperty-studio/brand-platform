import type { PkgFile } from '@/lib/portal/packages';

// Logos imported from the Figma assets page take over from the kit's logos everywhere the platform shows a logo:
// the portal header, the sign-in screen, emails, avatars and project thumbnails.
type Row = { path: string; storage_path: string | null };

export function figmaLogoFiles(content: unknown): PkgFile[] {
  const files = ((content as { packages?: Record<string, { files?: PkgFile[] }> } | null)?.packages?.logos?.files) || [];
  return files.filter((f) => f.fromFigma && /\.(svg|png)$/i.test(f.name));
}

/** The project's files with kit logos swapped for the Figma ones, when there are any */
export function withFigmaLogos<T extends Row>(files: T[], content: unknown, extra: Omit<T, 'path' | 'storage_path'>): T[] {
  const fig = figmaLogoFiles(content);
  if (!fig.length) return files;
  return [...files.filter((f) => !f.path.startsWith('assets/logo/')), ...fig.map((f) => ({ ...extra, path: `assets/logo/${f.name}`, storage_path: f.path } as T))];
}

/** The logo to show on light grounds, and one for dark grounds if there is one; SVG first */
export function pickLogo<T extends Row>(files: T[]) {
  const logos = files.filter((f) => f.path.startsWith('assets/logo/') && f.storage_path).sort((a, b) => Number(b.path.endsWith('.svg')) - Number(a.path.endsWith('.svg')));
  const isLight = (p: string) => /white|light|reverse|negative|inverse/i.test(p);
  const main = logos.find((l) => /dark|black|primary|horizontal|main|positive/i.test(l.path) && !isLight(l.path)) || logos.find((l) => !isLight(l.path)) || logos[0];
  return { main, light: logos.find((l) => isLight(l.path)) };
}
