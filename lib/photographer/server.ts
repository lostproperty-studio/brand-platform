import { appAccess } from '@/lib/apps/server';
import { projectStages, canSee } from '@/lib/features';
import { publishedSnapshot, buildSnapshot } from '@/lib/projects/snapshot';
import { chapterText, keyFor } from '@/lib/portal/guide';

// Who can use Photographer: the apps' access, and its release stage (studio-only to start; Admin settings → Releases)
export async function photoAccess(slug: string) {
  const a = await appAccess(slug, 'photographer'); if (!a) return null;
  const stage = (await projectStages(a.p.id)).photographer;
  return canSee(stage, a.acc.staff) ? { ...a, stage } : null;
}
export const BUCKET = 'previews';
export const photoPrefix = (projectId: string) => `${projectId}/photographer/`;

/** The art direction, from the guidelines: the imagery chapters' words and the design qualities. The studio sees
 *  what's being worked on; clients what's published. */
export async function artDirection(projectId: string, staff: boolean) {
  const snap = (staff ? await buildSnapshot(projectId).catch(() => null) : null) || await publishedSnapshot(projectId);
  const chapters = (snap?.guide?.chapters || []).filter((c) => (c.key || keyFor(`${c.title} ${c.kicker}`)) === 'imagery');
  const text = chapters.flatMap((c) => [c.title, c.lede, ...c.rules.map((r) => `${r.title}: ${r.text}`), ...chapterText(c)]).filter(Boolean).join('\n').slice(0, 12000);
  return { client: snap?.client || '', line: snap?.line || '', design: snap?.design || [], text, colours: (snap?.colours || []).slice(0, 10).map((c) => `${c.name} ${c.hex}`) };
}
