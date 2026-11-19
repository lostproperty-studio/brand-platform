import { adminClient } from '@/lib/supabase/server';
import { buildSnapshot, publishedSnapshot } from '@/lib/projects/snapshot';
import { keyFor } from '@/lib/portal/guide';
import { readPanel } from '@/lib/plugins/catalog';
import type { PanelBrand, PanelImage, PanelLogo } from '@/components/panel/types';
import type { Photo } from '@/lib/photographer/model';

// What the LP panel shows for one client, in any app: the published brand (the studio sees its working copy), the
// logo files from the kit, approved Photographer images, and the words. Links are signed and last a few hours.

const HOURS = 6;
const title = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());
const DARK = /(white|reverse|reversed|negative|inverse|knock.?out|on.?dark|dark.?bg)/i;

export async function panelBrand(projectId: string, slug: string, staff: boolean, origin: string): Promise<PanelBrand | null> {
  const sb = adminClient();
  const snap = (staff ? await buildSnapshot(projectId).catch(() => null) : null) || await publishedSnapshot(projectId);
  if (!snap) return null;
  const { data: proj } = await sb.from('projects').select('content').eq('id', projectId).maybeSingle();
  const show = readPanel(proj?.content);

  // Logos: the kit's logo files, one per artwork, preferring PNG (every app can place it) and keeping SVG where that's all there is
  const { data: files } = await sb.from('deliverable_files').select('path, storage_path, deliverable_parts!inner(project_id, visible)').eq('deliverable_parts.project_id', projectId).like('path', 'assets/logo%');
  const byStem = new Map<string, { path: string; storage: string }>();
  for (const f of (files || []) as { path: string; storage_path: string | null; deliverable_parts: { visible: boolean } | { visible: boolean }[] }[]) {
    const vis = Array.isArray(f.deliverable_parts) ? f.deliverable_parts[0]?.visible : f.deliverable_parts?.visible;
    if (!f.storage_path || (!staff && vis === false) || !/\.(png|svg)$/i.test(f.path)) continue;
    const stem = f.path.replace(/\.(png|svg)$/i, '');
    const had = byStem.get(stem);
    if (!had || (/\.png$/i.test(f.path) && !/\.png$/i.test(had.path))) byStem.set(stem, { path: f.path, storage: f.storage_path });
  }
  const logos: PanelLogo[] = [];
  for (const [stem, f] of [...byStem.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 60)) {
    const { data } = await sb.storage.from('kits').createSignedUrl(f.storage, HOURS * 3600);
    if (!data?.signedUrl) continue;
    const parts = stem.split('/'), file = parts.pop()!, group = parts.length > 2 ? title(parts[parts.length - 1]) : 'Logo';
    logos.push({ id: stem, name: title(file), group, format: f.path.toLowerCase().endsWith('.svg') ? 'svg' : 'png', url: data.signedUrl, onDark: DARK.test(file) });
  }

  // Images: collections in Photographer that have been signed off (the studio sees collections in review too)
  const images: PanelImage[] = [];
  const { data: cols } = await sb.from('app_files').select('id, title, status, data').eq('project_id', projectId).eq('app', 'photographer').in('status', staff ? ['signed', 'review'] : ['signed']).order('updated_at', { ascending: false }).limit(20);
  for (const c of (cols || []) as { id: string; title: string; data: { images?: Photo[] } }[]) {
    for (const ph of (c.data?.images || []).slice(0, 40)) {
      if (!ph.path || images.length >= 120) continue;
      const { data } = await sb.storage.from('previews').createSignedUrl(ph.path, HOURS * 3600);
      if (data?.signedUrl) images.push({ id: ph.id, name: ph.name || c.title, url: data.signedUrl, w: ph.w, h: ph.h, collection: c.title });
    }
  }

  // Rules, short: the logo, colour and type chapters' rules
  const rulesFor = (k: string) => snap.chapters.filter((c) => keyFor(c.title) === k).flatMap((c) => c.rules.map((r) => `${r.title}: ${r.text}`)).slice(0, 8);
  // Words: how the brand writes, as the studio has set it down, and lines the team says have worked
  const coach = snap.voice?.coach;
  const words = {
    summary: coach?.summary || '',
    principles: (coach?.codified || []).map((c) => c.text).filter(Boolean).slice(0, 10),
    lines: (snap.knowledge || []).filter((k) => k.kind !== 'missed').map((k) => k.text).slice(0, 20)
  };

  return {
    client: snap.client, line: snap.line, portalUrl: `${origin}/p/${slug}`, show,
    logos: show.logos ? logos : [], colours: show.colours ? snap.colours : [], type: show.type ? snap.fonts : [],
    images: show.images ? images : [], words: show.words ? words : { summary: '', principles: [], lines: [] },
    rules: { logo: rulesFor('logo'), colour: rulesFor('colour'), type: rulesFor('type') }
  };
}
