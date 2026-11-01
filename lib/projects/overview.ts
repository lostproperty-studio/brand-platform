import { figma } from '@/lib/figma/scan';

const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((ok) => setTimeout(() => ok(null), ms))]);

/** For the project dashboard: the Figma file's own thumbnail, name and last change. Left out if Figma is slow. */
export async function portalShot(_projectId: string, _content: unknown, figmaKey: string | null) {
  const file = figmaKey ? await within(figma<{ name: string; thumbnailUrl?: string; lastModified?: string }>(`/files/${figmaKey}?depth=1`, 1).catch(() => null), 4000) : null;
  return { figma: file ? { name: file.name, thumb: file.thumbnailUrl, modified: file.lastModified } : {} };
}
