import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';
import { projectStages } from '@/lib/features';
import { signMany } from '@/lib/storage/signed';
import type { Doc } from '@/lib/director/model';

// Who can use Director on a project: studio staff unless it's switched off, and the client's team once it's at
// Client beta or Live (Admin settings → Releases).
export async function directorAccess(slug: string) {
  const p = await projectBySlug(slug); if (!p) return null;
  const acc = await requireProjectAccess(p.id); if (acc instanceof Response) return null;
  const stage = (await projectStages(p.id)).director;
  const ok = acc.staff ? stage !== 'off' : stage === 'beta' || stage === 'live';
  return ok ? { p, acc, stage } : null;
}

export const BUCKET = 'previews';
export const mediaPrefix = (projectId: string) => `${projectId}/director/`;

/** Media paths a file uses, for signing */
export function docPaths(d: Doc) {
  return [...(d.scenes || []).map((s) => s.media?.path), ...(d.audio || []).map((a) => a.media?.path)].filter((x): x is string => !!x);
}

/** Fresh view links on every media item in a file (only this project's own Director files) */
export async function signDoc(projectId: string, d: Doc): Promise<Doc> {
  const pre = mediaPrefix(projectId);
  const paths = docPaths(d).filter((p) => p.startsWith(pre));
  if (!paths.length) return d;
  const { data } = await signMany(BUCKET, paths, 6 * 3600);
  const url = Object.fromEntries((data || []).filter((x) => x.path).map((x) => [x.path!, x.signedUrl]));
  return {
    ...d,
    scenes: d.scenes.map((s) => (s.media ? { ...s, media: { ...s.media, url: url[s.media.path] } } : s)),
    audio: d.audio.map((a) => (a.media ? { ...a, media: { ...a.media, url: url[a.media.path] } } : a))
  };
}

/** Links expire, so they're never saved: strip them before storing */
export function stripDoc(d: Doc): Doc {
  return {
    ...d,
    scenes: (d.scenes || []).map((s) => (s.media ? { ...s, media: { path: s.media.path, kind: s.media.kind } } : s)),
    audio: (d.audio || []).map((a) => (a.media ? { ...a, media: { path: a.media.path, kind: a.media.kind } } : a))
  };
}

/** A small picture for the file's tile: the first scene's still image, or its video */
export function thumbOf(d: Doc) {
  const s = d.scenes.find((x) => x.media);
  return s?.media?.path || null;
}

export async function signThumbs(projectId: string, rows: { thumb: string | null }[]) {
  const pre = mediaPrefix(projectId);
  const paths = rows.map((r) => r.thumb).filter((x): x is string => !!x && x.startsWith(pre));
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await signMany(BUCKET, paths, 6 * 3600);
  return Object.fromEntries((data || []).filter((x) => x.path).map((x) => [x.path!, x.signedUrl]));
}

export const db = () => adminClient();
