import { figma, parseFigmaUrl } from '@/lib/figma/scan';

// A project's two Figma links: one for the brand assets (logos, colours, type, the form) and one for the guidelines.
// They can be the same file (the template has both pages) or different files.
export type Source = { url: string; key: string; page: string | null; file?: string; pageName?: string; importedAt?: string };
export type Sources = { assets?: Source; guidelines?: Source };

export function readSources(content: unknown, legacy?: { figma_key?: string | null; figma_page_id?: string | null }): Sources {
  const s = ((content as { sources?: Sources } | null)?.sources || {}) as Sources;
  // Projects made before there were two links: the one Figma file is the guidelines source
  if (!s.guidelines && legacy?.figma_key) s.guidelines = { url: `https://www.figma.com/design/${legacy.figma_key}${legacy.figma_page_id ? `?node-id=${legacy.figma_page_id.replace(':', '-')}` : ''}`, key: legacy.figma_key, page: legacy.figma_page_id || null };
  return s;
}

/** Works out which page a link means: the page it points at, or else the page named for what it's for */
export async function resolvePage(key: string, nodeId: string | null, want: 'assets' | 'guidelines') {
  const meta = await figma<{ name: string; document: { children?: { id: string; name: string; type: string }[] } }>(`/files/${key}?depth=1`);
  const pages = meta.document.children || [];
  const named = pages.find((p) => (want === 'assets' ? /^assets?$|asset/i : /^guidelines?$|guide/i).test(p.name.trim()));
  const direct = nodeId ? pages.find((p) => p.id === nodeId) : undefined;
  // A link to a frame inside a page: use the named page, else keep the node for the older scan to resolve
  // In a file made from the studio template the page named for the job wins, wherever in the file the link points
  const template = !!named && pages.some((p) => /^read\s*me$/i.test(p.name.trim()));
  const page = template ? named : direct || named;
  return { file: meta.name, page: page?.id || nodeId, pageName: page?.name, template };
}

export async function sourceFromUrl(url: string, want: 'assets' | 'guidelines'): Promise<Source> {
  const f = parseFigmaUrl(url);
  if (!f) throw new Error('That isn’t a Figma file link.');
  const r = await resolvePage(f.key, f.nodeId, want).catch(() => null);
  return { url, key: f.key, page: r?.page || f.nodeId, file: r?.file, pageName: r?.pageName };
}
