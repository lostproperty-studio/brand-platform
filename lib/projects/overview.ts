import { adminClient } from '@/lib/supabase/server';
import { figma } from '@/lib/figma/scan';
import { normaliseGuide, type Guide } from '@/lib/portal/guide';
import { readShowcase } from '@/lib/showcase';

const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((ok) => setTimeout(() => ok(null), ms))]);

/** Pictures for the project dashboard: the portal's hero (the first showcase image, else the first guideline image),
 *  the logo, and the Figma file's own thumbnail, name and last change. Anything slow or missing is left out. */
export async function portalShot(projectId: string, content: unknown, figmaKey: string | null) {
  const sb = adminClient();
  const sc = readShowcase(content);
  const g = normaliseGuide((content as { guide?: Guide } | null)?.guide);
  const fromShowcase = sc.rows.flatMap((r) => r.frames).find((f) => f.kind === 'image' && f.path)?.path;
  const fromGuide = g?.chapters.filter((c) => !c.hidden && !c.removed).flatMap((c) => c.blocks.filter((b) => !b.hidden && !b.draft).flatMap((b) => [...(b.media || []), ...(b.items || []).map((i) => i.media).filter(Boolean)])).find((m) => m && m.kind === 'photo')?.path;
  const heroPath = fromShowcase || fromGuide;
  const [hero, logo, file] = await Promise.all([
    heroPath ? sb.storage.from('previews').createSignedUrl(heroPath, 3600).then((r) => r.data?.signedUrl ?? null) : Promise.resolve(null),
    sb.from('deliverable_files').select('storage_path, deliverable_parts!inner(project_id)').eq('deliverable_parts.project_id', projectId).like('path', 'assets/logo/%.svg').limit(1).maybeSingle()
      .then(async ({ data }) => (data?.storage_path ? (await sb.storage.from('kits').createSignedUrl(data.storage_path, 3600)).data?.signedUrl ?? null : null)),
    figmaKey ? within(figma<{ name: string; thumbnailUrl?: string; lastModified?: string }>(`/files/${figmaKey}?depth=1`, 1).catch(() => null), 4000) : Promise.resolve(null)
  ]);
  return { hero, logo, figma: file ? { name: file.name, thumb: file.thumbnailUrl, modified: file.lastModified } : {} };
}
