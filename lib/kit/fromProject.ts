import { adminClient } from '@/lib/supabase/server';
import { exportNodes } from '@/lib/figma/scan';
import { env } from '@/lib/env';
import { getPlaybook } from '@/lib/playbookStore';
import type { AssetFile, Colour, Font, KitInput, Rule } from '@/lib/kit/build';
import type { ProjectFont } from '@/lib/fonts';
import { FONT_BUCKET } from '@/lib/projects/fonts';

const CH: Record<string, string> = { logo: 'logo', wordmark: 'logo', symbol: 'logo', lockups: 'logo', type: 'type', colour: 'colour', grid: 'layout', layout: 'layout', art: 'imagery', imagery: 'imagery', materials: 'imagery', voice: 'voice' };
const TPL: [RegExp, string][] = [[/instagram post|4:5/i, 'social-post-4x5'], [/story|9:16/i, 'social-story-9x16'], [/linkedin|1\.91/i, 'social-landscape-1-91x1'], [/poster/i, 'poster-a3'], [/signage/i, 'signage-panel'], [/brochure/i, 'brochure-spread-a4'], [/web/i, 'web-hero'], [/email/i, 'email-header'], [/slide|presentation/i, 'slide-16x9']];

type Item = { chapter: string; kind: string; title: string; proposal: string; answer: string; recommend: string; status: string; input: string; node_id: string | null };

export function resolvedText(it: Item) {
  if (it.status === 'skipped') return '';
  if (it.answer) return it.input === 'multi' ? it.answer.split('\n').join(', ') : it.answer;
  if (it.input === 'text') return '';
  if (it.input === 'choice' || it.input === 'multi') return it.recommend || '';
  return it.proposal;
}

/** Collects everything the kit needs: brand basics from the project, rules and assets from the latest review. */
export async function kitInputFor(projectId: string): Promise<{ input: KitInput; figmaKey: string | null }> {
  const sb = adminClient();
  const { data: p, error } = await sb.from('projects').select('client, slug, line, kit_version, brand, figma_key, content').eq('id', projectId).single();
  if (error) throw error;
  const { data: scan } = await sb.from('scans').select('id').eq('project_id', projectId).eq('status', 'done').order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { data: items } = scan ? await sb.from('review_items').select('chapter, kind, title, proposal, answer, recommend, status, input, node_id').eq('scan_id', scan.id).order('ord') : { data: [] as Item[] };
  const brand = (p.brand || {}) as { core?: { name: string; hex: string; note?: string }[]; fonts?: (Partial<ProjectFont> & { role: string; name: string; weight?: string; lh?: string; tracking?: string; caseV?: string; licence?: string })[] };

  const colours: Colour[] = (brand.core || []).map((c) => ({ name: c.name, hex: c.hex.toUpperCase(), role: c.note || '' }));
  const fonts: Font[] = (brand.fonts || []).filter((f) => f.name).map((f) => ({ role: f.role, name: f.name, usage: f.label || '', weight: f.weight || 'Regular', lineHeight: f.lh, tracking: f.tracking && f.tracking !== 'None' ? f.tracking.replace('+', '') : undefined, textCase: f.caseV, licence: f.licenceNote ?? f.licence, licensed: (f.files || []).some((x) => x.licence === 'licensed'), trialInUse: (f.files || []).some((x) => x.licence === 'trial') }));
  const licensedFiles = (brand.fonts || []).filter((f) => f.name).flatMap((f) => (f.files || []).filter((x) => x.licence === 'licensed').map((x) => ({ family: f.name, name: x.name, path: x.path })));
  const list = (items || []) as Item[];
  const rules: Rule[] = list.filter((i) => i.kind !== 'asset' && i.kind !== 'issue' && CH[i.chapter]).map((i) => ({ chapter: CH[i.chapter], title: i.title, text: resolvedText(i) })).filter((r) => r.text);
  // Assets imported from the Figma assets page are the kit's assets; the older scan's review items only when there are none
  const figmaAssets = await figmaPackageAssets(projectId, p.content);
  const assets: AssetFile[] = figmaAssets.length ? figmaAssets : list.filter((i) => i.kind === 'asset' && i.status !== 'skipped' && i.node_id).map((i) => {
    const name = (resolvedText(i).match(/[a-z0-9-]+\.svg/) || [p.slug + '-' + i.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.svg'])[0];
    return { path: `assets/logo/${name}`, nodeId: i.node_id!, format: 'svg' as const, description: i.title };
  });
  const tplItem = list.find((i) => i.chapter === 'templates' && i.input === 'multi');
  const picked = tplItem ? resolvedText(tplItem).split(/,\s*/).map((a) => TPL.find(([re]) => re.test(a))?.[1]).filter(Boolean) as string[] : [];
  return {
    figmaKey: p.figma_key,
    input: { client: p.client, slug: p.slug, version: p.kit_version, line: p.line || '', portalUrl: `${env.appUrl()}/p/${p.slug}`, colours, fonts, rules, assets, templates: picked.length ? [...new Set(picked)] : ['social-post-4x5'], fontFiles: await Promise.all(licensedFiles.map(async (x) => ({ family: x.family, name: x.name, bytes: new Uint8Array(await (await sb.storage.from(FONT_BUCKET).download(x.path)).data!.arrayBuffer()) }))), figmaUrl: p.figma_key ? `https://www.figma.com/design/${p.figma_key}` : undefined, aiDonts: (await getPlaybook()).aiDonts }
  };
}

const KIT_FOLDER: Record<string, string> = { logos: 'logo', avatars: 'avatars', icons: 'icons', images: 'imagery', graphics: 'graphics' };
/** The files in each download that came from the Figma assets page, with their bytes, at their place in the kit */
async function figmaPackageAssets(projectId: string, content: unknown): Promise<AssetFile[]> {
  const sb = adminClient();
  const pkgs = ((content as { packages?: Record<string, { title?: string; files?: { name: string; path: string; fromFigma?: boolean }[] }> } | null)?.packages) || {};
  const out: AssetFile[] = [];
  for (const [key, s] of Object.entries(pkgs)) {
    const folder = KIT_FOLDER[key] || (key.startsWith('custom-') ? key.slice(7) : null); if (!folder) continue;
    for (const f of (s.files || []).filter((x) => x.fromFigma)) {
      const { data } = await sb.storage.from('kits').download(f.path); if (!data) continue;
      out.push({ path: `assets/${folder}/${f.name}`, nodeId: '', format: f.name.endsWith('.svg') ? 'svg' : 'png', description: `${s.title || key}: ${f.name.replace(/\.[a-z]+$/, '').replace(/-/g, ' ')}`, bytes: new Uint8Array(await data.arrayBuffer()) });
    }
  }
  return out;
}

/** Downloads the SVG (and a 2× PNG) of every accepted asset layer. */
export async function attachAssetBytes(input: KitInput, figmaKey: string) {
  if (!input.assets.length || input.assets.every((a) => a.bytes)) return;
  const ids = input.assets.map((a) => a.nodeId);
  const [svgs, pngs] = await Promise.all([exportNodes(figmaKey, ids, 'svg'), exportNodes(figmaKey, ids, 'png', 2)]);
  const extra: AssetFile[] = [];
  for (const a of input.assets) {
    const s = svgs[a.nodeId]; if (s) a.bytes = new Uint8Array(await (await fetch(s)).arrayBuffer());
    const pn = pngs[a.nodeId]; if (pn) extra.push({ path: a.path.replace(/\.svg$/, '@2x.png'), nodeId: a.nodeId, format: 'png', description: a.description + ' (PNG 2×)', bytes: new Uint8Array(await (await fetch(pn)).arrayBuffer()) });
  }
  input.assets.push(...extra);
}
