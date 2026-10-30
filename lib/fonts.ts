// Typefaces on a project. Studios usually start on trial files and swap in licensed files before delivery,
// so every file carries its own licence state and the family's state is derived from its files.

export type FontFile = { path: string; name: string; weight: number; style: 'normal' | 'italic'; format: 'woff2' | 'woff' | 'otf' | 'ttf'; licence: 'trial' | 'licensed'; bytes: number; uploaded_at: string };
export type ProjectFont = { role: string; label: string; name: string; licenceNote?: string; files: FontFile[] };
export type FontState = 'none' | 'trial' | 'mixed' | 'licensed';

export const DEFAULT_ROLES: { role: string; label: string }[] = [
  { role: 'display', label: 'Headlines' }, { role: 'body', label: 'Body copy' }, { role: 'caption', label: 'Captions' }
];

const WEIGHTS: [RegExp, number][] = [
  [/hairline|thin/i, 100], [/extra[-\s]?light|ultra[-\s]?light/i, 200], [/light/i, 300], [/medium/i, 500],
  [/semi[-\s]?bold|demi/i, 600], [/extra[-\s]?bold|ultra[-\s]?bold|heavy/i, 800], [/black/i, 900], [/bold/i, 700],
  [/book|regular|normal|roman/i, 400]
];
const WEIGHT_NAMES: Record<number, string> = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };
export const weightName = (w: number) => WEIGHT_NAMES[w] || String(w);

/** Reads weight, style and format from a file name like "Waldenburg-SemiBoldItalic-Trial.woff2". */
export function parseFontFile(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, '');
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const format = (['woff2', 'woff', 'otf', 'ttf'].includes(ext) ? ext : null) as FontFile['format'] | null;
  const weight = WEIGHTS.find(([re]) => re.test(base))?.[1] ?? 400;
  const style: FontFile['style'] = /italic|oblique/i.test(base) ? 'italic' : 'normal';
  const looksTrial = /\b(trial|test|demo|eval)\b|[-_](trial|test|demo)\b/i.test(base);
  return { format, weight, style, looksTrial };
}

export function fontState(f: ProjectFont): FontState {
  if (!f.files.length) return 'none';
  const lic = f.files.filter((x) => x.licence === 'licensed').length;
  return lic === f.files.length ? 'licensed' : lic === 0 ? 'trial' : 'mixed';
}

/** Families that would reach the client without licensed files. */
export function fontsNeedingLicence(fonts: ProjectFont[]) {
  return fonts.filter((f) => f.name && fontState(f) !== 'licensed');
}

export const FONT_MIME: Record<FontFile['format'], string> = { woff2: 'font/woff2', woff: 'font/woff', otf: 'font/otf', ttf: 'font/ttf' };
const CSS_FORMAT: Record<FontFile['format'], string> = { woff2: 'woff2', woff: 'woff', otf: 'opentype', ttf: 'truetype' };

/** @font-face rules for the portal, using short-lived signed URLs. Prefers licensed files over trial ones. */
export function fontFaceCss(fonts: ProjectFont[], urls: Record<string, string>) {
  const rules: string[] = [];
  for (const f of fonts) {
    const family = `brand-${f.role}`;
    const byFace = new Map<string, FontFile[]>();
    for (const file of f.files) { const k = `${file.weight}-${file.style}`; byFace.set(k, [...(byFace.get(k) || []), file]); }
    for (const files of byFace.values()) {
      const pick = files.filter((x) => x.licence === 'licensed').length ? files.filter((x) => x.licence === 'licensed') : files;
      const order = ['woff2', 'woff', 'otf', 'ttf'];
      const src = pick.sort((a, b) => order.indexOf(a.format) - order.indexOf(b.format)).filter((x) => urls[x.path]).map((x) => `url("${urls[x.path]}") format("${CSS_FORMAT[x.format]}")`).join(', ');
      if (src) rules.push(`@font-face { font-family: "${family}"; src: ${src}; font-weight: ${pick[0].weight}; font-style: ${pick[0].style}; font-display: swap; }`);
    }
  }
  const vars = fonts.map((f) => `--font-${f.role}: "brand-${f.role}", ${JSON.stringify(f.name || 'sans-serif')}, sans-serif;`).join(' ');
  return rules.join('\n') + (vars ? `\n:root { ${vars} }` : '');
}
