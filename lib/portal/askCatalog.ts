import { adminClient } from '@/lib/supabase/server';
import { signMany, signOne } from '@/lib/storage/signed';
import { chapterSlug, type PortalCtx } from '@/lib/portal/context';
import { portalPackages, visibleToClient } from '@/lib/portal/packages';
import { lum } from '@/lib/portal/generated';

const textOn = (hex: string) => (lum(hex) > 0.6 ? '#000000' : '#FFFFFF');

// What Ask can show inside an answer, as cards rather than words: colour swatches, logo files, downloads,
// guideline pages and typefaces. The model writes a token like [[colour:Signal Orange]] where a card should go;
// the portal swaps it for the card from this catalog. Anything not in the catalog stays plain text, so a card
// can never show something the brand doesn't have.

export type AskCatalog = {
  colours: { id: string; name: string; hex: string; role?: string; ink: string }[];
  logos: { id: string; name: string; url: string; download: string; ground: 'light' | 'dark' }[];
  downloads: { id: string; title: string; detail: string; href: string; page: string }[];
  pages: { id: string; title: string; href: string }[];
  fonts: { id: string; name: string; role: string; family: string }[];
};

const idOf = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function askCatalog(pc: PortalCtx, slug: string): Promise<AskCatalog> {
  const snap = pc.snap!;
  const base = `/p/${slug}`;
  const colours = snap.colours.map((c) => ({ id: idOf(c.name), name: c.name, hex: c.hex.toUpperCase(), role: c.role || undefined, ink: textOn(c.hex) }));

  // Logo files: SVGs (PNG only where there's no SVG of the same name), with the ground each is made for
  const files = pc.files.filter((f) => /^assets\/logo\/.+\.(svg|png)$/i.test(f.path) && f.storage_path && (pc.preview || f.partStatus === 'ready'));
  const names = new Set(files.map((f) => f.path));
  const logoFiles = files.filter((f) => f.path.endsWith('.svg') || !names.has(f.path.replace(/\.png$/i, '.svg'))).slice(0, 24);
  const { data: signed } = logoFiles.length ? await signMany('kits', logoFiles.map((f) => f.storage_path!), 6 * 3600) : { data: [] };
  const url = new Map((signed || []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl]));
  const logos = logoFiles.filter((f) => url.has(f.storage_path!)).map((f) => {
    const name = f.path.split('/').pop()!;
    return { id: idOf(name.replace(/\.[a-z]+$/i, '')), name, url: url.get(f.storage_path!)!, download: `/api/p/${slug}/download?path=${encodeURIComponent(f.path)}`, ground: /white|light|reverse|negative|inverse/i.test(name) ? 'dark' as const : 'light' as const };
  });

  const pkgs = (await portalPackages(pc)).filter((p) => (pc.preview ? !p.empty : visibleToClient(p)));
  const downloads = pkgs.map((p) => ({ id: p.id, title: p.title, detail: [p.count ? `${p.count} file${p.count === 1 ? '' : 's'}` : '', p.formats.join(', ')].filter(Boolean).join(' · '), href: `/api/p/${slug}/package/${p.id}`, page: `${base}/resources#${p.id}` }));
  const extra = [{ id: 'design-system', title: 'Design system', detail: 'For Claude and AI tools · ZIP', href: `/api/p/${slug}/design-system`, page: `${base}/resources/design-system` }];

  const pages = (snap.guide?.chapters || []).filter((c) => !c.hidden && !c.removed).map((c) => ({ id: idOf(c.title), title: c.title, href: `${base}/guidelines/${chapterSlug(c.id)}` }));
  const fonts = pc.fonts.filter((f) => f.name).map((f) => ({ id: f.role, name: f.name, role: f.label || f.role, family: `var(--font-${f.role}), "${f.name}", sans-serif` }));
  return { colours, logos, downloads: [...downloads, ...extra], pages, fonts };
}

/** What the model is told about the cards it can use */
export function catalogPrompt(c: AskCatalog) {
  const list = (xs: { id: string }[], label: (x: never) => string) => xs.map((x) => `${x.id} (${label(x as never)})`).join('; ') || 'none';
  return `SHOWING THINGS (cards)
Where it helps, show the real thing instead of describing it, by writing a token on its own line or inline. The portal turns each token into a card. Use only these ids:
- Colours [[colour:id]] (a swatch with its values; several in a row make a palette): ${list(c.colours, (x: AskCatalog['colours'][number]) => `${x.name} ${x.hex}`)}
- Logo files [[logo:id]] (the file on its ground, with a download): ${list(c.logos, (x: AskCatalog['logos'][number]) => x.name)}
- Downloads [[download:id]] (a download card): ${list(c.downloads, (x: AskCatalog['downloads'][number]) => x.title)}
- Guideline pages [[page:id]] (a link to the chapter): ${list(c.pages, (x: AskCatalog['pages'][number]) => x.title)}
- Typefaces [[font:id]] (a specimen): ${list(c.fonts, (x: AskCatalog['fonts'][number]) => `${x.name}, ${x.role}`)}
Rules: put a [[page:…]] at the end of an answer for the chapter it came from. Show colours whenever you name them, the logo file whenever you recommend one, and the download when someone needs files. Never invent ids. Don't repeat in words what a card already shows (no need to list a hex after its swatch).
Write in short paragraphs; use **bold** sparingly and "- " lists for steps or options. No headings, no tables.`;
}
