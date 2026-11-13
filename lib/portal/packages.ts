import { adminClient } from '@/lib/supabase/server';
import type { KitFileRow } from '@/lib/portal/context';
import type { ProjectFont } from '@/lib/fonts';

// Resources are presented as packages: everything of one kind in one download, with a visual of what's inside.
// Core packages (logos, colours, fonts, social avatars) have a place in every portal. Icons, images and graphic
// language are spaces the studio switches on when a brand has them, and custom packages hold anything unique
// (Dusk's creatures, say). Packages fill themselves from the kit, plus files the studio uploads. The client
// only sees packages with something in them, so a simple brand stays simple.

export type PackageKind = 'logos' | 'colours' | 'fonts' | 'avatars' | 'icons' | 'images' | 'graphics' | 'custom' | 'tokens' | 'guidelines' | 'templates' | 'team';
export type PkgFile = { name: string; path: string; bytes: number; type: string; /** Came from the Figma template; replaced on each rescan */ fromFigma?: boolean; /** Short content hash, to tell changed files from unchanged ones */ hash?: string };
export type PackageSettings = { title?: string; purpose?: string; hidden?: boolean; enabled?: boolean; files?: PkgFile[]; cover?: string;
  /** Who owns the files and how they may be used (the approved image library) */ owner?: string;
  /** A note shown with the files, e.g. the imagery disclaimer */ note?: string;
  /** When the studio last refreshed the package from the guidelines, and the guidelines' revision then */ refreshedAt?: string; refreshedRev?: number };
export type PackageMap = Record<string, PackageSettings>;
export type Section = 'brand' | 'elements' | 'builders' | 'team';

type Def = { kind: PackageKind; section: Section; title: string; purpose: string; core?: boolean; drafted?: boolean; kit?: RegExp; part?: string };
export const DEFS: Def[] = [
  { kind: 'logos', section: 'brand', core: true, title: 'Logos', purpose: 'Every logo version and colourway, ready to place.', kit: /^assets\/logo\//, part: 'assets' },
  { kind: 'colours', section: 'brand', core: true, title: 'Colours', purpose: 'The palette as swatches for design apps, and as values for code and documents.' },
  { kind: 'fonts', section: 'brand', core: true, title: 'Fonts', purpose: 'The brand typefaces with their licence.', kit: /^assets\/fonts\/(?!LICENCE)/, part: 'assets' },
  { kind: 'avatars', section: 'brand', core: true, title: 'Social avatars', purpose: 'Profile pictures for social accounts, safe for circle crops.' },
  { kind: 'icons', section: 'elements', drafted: true, title: 'Icons', purpose: 'The icon set, for signage, digital and print.', kit: /^assets\/icons?\//, part: 'assets' },
  { kind: 'images', section: 'elements', drafted: true, title: 'Images', purpose: 'Photography and imagery cleared for use.', kit: /^assets\/(imagery|images|photography)\//, part: 'assets' },
  { kind: 'graphics', section: 'elements', drafted: true, title: 'Graphic language', purpose: 'Patterns, shapes and graphic devices that make the brand recognisable.', kit: /^assets\/(patterns?|graphics?)\//, part: 'assets' },
  { kind: 'tokens', section: 'builders', title: 'Design tokens', purpose: 'Colours, type and spacing as values, for developers and AI tools.', kit: /^tokens\//, part: 'tokens' },
  { kind: 'guidelines', section: 'builders', title: 'Guidelines as text', purpose: 'The rules as Markdown, with instructions for AI tools.', kit: /^(guidelines\/|AGENTS\.md$|README\.md$|CHANGELOG\.md$)/, part: 'guidelines' },
  { kind: 'templates', section: 'builders', title: 'Templates', purpose: 'Ready-made layouts with the logo and layout fixed and copy and image as slots.', kit: /^templates\//, part: 'templates' },
  { kind: 'team', section: 'team', title: 'Team files', purpose: 'Files your team has shared: presentations, photography, signed-off artwork.', kit: /^team\//, part: 'team' }
];
export const SECTIONS: { id: Section; title: string; blurb: string }[] = [
  { id: 'brand', title: 'Brand assets', blurb: 'The essentials for anything you make.' },
  { id: 'elements', title: 'Brand elements', blurb: 'The parts that make the brand its own.' },
  { id: 'builders', title: 'For developers and AI tools', blurb: 'The brand as values, text and code.' },
  { id: 'team', title: 'Shared by your team', blurb: 'Files added in the portal.' }
];

export type PreviewImage = { url: string; name: string };
export type Package = {
  id: string; kind: PackageKind; section: Section; title: string; purpose: string;
  /** Kit files (served from the kit) and studio uploads */
  kitFiles: KitFileRow[]; uploads: PkgFile[];
  count: number; formats: string[]; bytes: number;
  /** Can be downloaded now (its brief part is Ready, or it's generated, or it's studio preview) */
  ready: boolean; status?: string;
  empty: boolean; hidden: boolean; core: boolean; drafted: boolean; custom: boolean; enabled: boolean;
  images: PreviewImage[]; cover?: string;
  owner?: string; note?: string; refreshedAt?: string; refreshedRev?: number;
};

const IMG = /\.(svg|png|jpe?g|webp|gif)$/i;
const ext = (n: string) => (n.split('.').pop() || '').toUpperCase();

/** Signed links for preview images in the kits bucket. */
async function sign(paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await adminClient().storage.from('kits').createSignedUrls([...new Set(paths)], 6 * 3600);
  return Object.fromEntries((data || []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]));
}

export function packageSettings(content: unknown): PackageMap {
  return ((content as { packages?: PackageMap } | null)?.packages || {}) as PackageMap;
}

/** Every package for a project, resolved against the kit, the studio's uploads and settings. */
export async function resolvePackages(opts: { files: KitFileRow[]; content: unknown; colours: { hex: string }[]; fonts: ProjectFont[]; preview: boolean; hasLogo: boolean }) {
  const settings = packageSettings(opts.content);
  const custom = Object.keys(settings).filter((k) => k.startsWith('custom-'));
  const defs: (Def & { id: string })[] = [...DEFS.map((d) => ({ ...d, id: d.kind as string })), ...custom.map((id) => ({ kind: 'custom' as const, section: 'elements' as const, title: settings[id].title || 'New package', purpose: settings[id].purpose || '', id }))];
  const out: Package[] = defs.map((d) => {
    const s = settings[d.id] || {};
    const uploads = s.files || [];
    // Files imported from the Figma assets page take over from the kit's files in that package
    const kitFiles = d.kit && !uploads.some((u) => u.fromFigma) ? opts.files.filter((f) => d.kit!.test(f.path) && !/manifest\.json$/.test(f.path)) : [];
    const generated = d.kind === 'colours' ? opts.colours.length > 0 : d.kind === 'avatars' ? opts.hasLogo && opts.colours.length > 0 && !uploads.length : false;
    const count = kitFiles.length + uploads.length + (d.kind === 'colours' && opts.colours.length ? 4 : 0) + (d.kind === 'avatars' && generated ? Math.min(3, opts.colours.length) : 0);
    const fontsNamed = d.kind === 'fonts' && opts.fonts.some((f) => f.name);
    const partStatus = kitFiles[0]?.partStatus;
    const ready = opts.preview || !kitFiles.length || kitFiles.every((f) => f.partStatus === 'ready');
    const formats = [...new Set([...kitFiles.map((f) => ext(f.path)), ...uploads.map((u) => ext(u.name)), ...(d.kind === 'colours' ? ['ASE', 'CSS', 'JSON'] : []), ...(d.kind === 'avatars' && generated ? ['SVG'] : [])])].filter(Boolean).slice(0, 5);
    const enabled = d.drafted ? !!s.enabled || kitFiles.length + uploads.length > 0 : true;
    return {
      id: d.id, kind: d.kind, section: d.section, title: s.title || d.title, purpose: s.purpose ?? d.purpose,
      kitFiles, uploads, count, formats, bytes: uploads.reduce((n, u) => n + u.bytes, 0),
      ready, status: ready ? undefined : partStatus,
      empty: count === 0 && !fontsNamed, hidden: !!s.hidden, core: !!d.core, drafted: !!d.drafted, custom: d.kind === 'custom', enabled,
      images: [], cover: s.cover, owner: s.owner, note: s.note, refreshedAt: s.refreshedAt, refreshedRev: s.refreshedRev
    };
  });
  // Preview images: a few files from each visual package
  const want = out.flatMap((p) => ['logos', 'icons', 'images', 'graphics', 'custom', 'avatars', 'team'].includes(p.kind)
    ? [...p.uploads.filter((u) => IMG.test(u.name)).map((u) => ({ p, path: u.path, name: u.name })), ...p.kitFiles.filter((f) => f.storage_path && IMG.test(f.path)).map((f) => ({ p, path: f.storage_path!, name: f.path }))]
      .filter((x, i, a) => !(x.name.endsWith('.png') && a.some((y) => y.name === x.name.replace(/\.png$/, '.svg')))).slice(0, p.kind === 'logos' ? 6 : 8)
    : []);
  const covers = out.filter((p) => p.cover).map((p) => p.cover!);
  const urls = await sign([...want.map((w) => w.path), ...covers]);
  for (const w of want) if (urls[w.path]) w.p.images.push({ url: urls[w.path], name: w.name.split('/').pop()! });
  for (const p of out) if (p.cover) p.cover = urls[p.cover];
  return out;
}

/** What a client sees: packages with something in them, not hidden, and spaces the studio has switched on. */
export const visibleToClient = (p: Package) => !p.hidden && !p.empty && p.enabled;

/** The packages for a portal page or download. */
export async function portalPackages(ctx: { files: KitFileRow[]; project: { content?: unknown }; snap: { colours: { hex: string }[] } | null; fonts: ProjectFont[]; preview: boolean }) {
  return resolvePackages({ files: ctx.files, content: ctx.project.content, colours: ctx.snap?.colours || [], fonts: ctx.fonts, preview: ctx.preview, hasLogo: ctx.files.some((f) => /^assets\/logo\/.+\.svg$/i.test(f.path)) });
}

/** What a chapter is about, from its key or, for chapters built from a template, its title */
export function chapterKind(c: { key: string | null; title: string }): string | null {
  if (c.key) return c.key;
  const t = c.title.toLowerCase();
  if (/logo|wordmark|symbol|marque/.test(t)) return 'logo';
  if (/colou?r|palette/.test(t)) return 'colour';
  if (/typ(e|ography)|font/.test(t)) return 'type';
  if (/imag|photo|art direction|picture/.test(t)) return 'imagery';
  if (/icon/.test(t)) return 'icons';
  if (/layout|grid|template/.test(t)) return 'layout';
  return null;
}
/** The approved image library: the Images package's pictures */
export const libraryImages = (p?: Package) => (p ? p.uploads.filter((u) => /\.(png|jpe?g|webp|gif|avif)$/i.test(u.name)) : []);
