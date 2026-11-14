'use client';
import type { Doc, FileRow, MediaRef } from '@/lib/director/model';

// Talking to the Director API from the app
export const api = (slug: string) => {
  const base = `/api/p/${slug}/director`;
  const json = async <T,>(r: Response): Promise<T> => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((j as { error?: string }).error || 'Something went wrong.'); return j as T; };
  return {
    list: () => fetch(`${base}/files`, { cache: 'no-store' }).then((r) => json<{ files: Tile[]; error?: string }>(r)),
    create: (title: string, aspect: string, data?: Doc) => fetch(`${base}/files`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, aspect, data }) }).then((r) => json<{ id: string }>(r)),
    open: (id: string) => fetch(`${base}/files/${id}`, { cache: 'no-store' }).then((r) => json<{ file: FileRow }>(r)),
    save: (f: FileRow) => fetch(`${base}/files/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: f.title, aspect: f.aspect, status: f.status, data: f.data }) }).then((r) => json<{ ok: true; at: string }>(r)),
    remove: (id: string) => fetch(`${base}/files/${id}`, { method: 'DELETE' }).then((r) => json<{ ok: true }>(r)),
    plan: (b: { prompt: string; length: number; aspect: string; mood?: string }) => fetch(`${base}/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => json<{ id: string }>(r)),
    generate: (b: { prompt: string; kind: 'image' | 'video' | 'audio'; aspect?: string; seconds?: number; sound?: 'music' | 'sfx' }) => fetch(`${base}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => json<{ media: MediaRef }>(r)),
    /** Uploads a file straight to storage and returns it as media */
    upload: async (file: File): Promise<MediaRef> => {
      const type = file.type || (/\.mov$/i.test(file.name) ? 'video/quicktime' : /\.mp4$/i.test(file.name) ? 'video/mp4' : '');
      const s = await fetch(`${base}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sign', name: file.name, type }) }).then((r) => json<{ path: string; signedUrl: string }>(r));
      const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', file);
      const up = await fetch(s.signedUrl, { method: 'PUT', body: fd, headers: { 'x-upsert': 'true' } });
      if (!up.ok) throw new Error(`Couldn’t upload ${file.name}.`);
      const v = await fetch(`${base}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'view', paths: [s.path] }) }).then((r) => json<{ urls: Record<string, string> }>(r));
      return { path: s.path, kind: type.startsWith('video') ? 'video' : type.startsWith('audio') ? 'audio' : 'image', url: v.urls[s.path] };
    }
  };
};

export type Tile = { id: string; title: string; aspect: string; status: 'plan' | 'edit'; updated_at: string; thumbUrl: string | null; thumbKind: string | null; scenes: number; seconds: number; cover: string | null };

export const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
export const secs = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}` : `${Math.round(n * 10) / 10}s`);
