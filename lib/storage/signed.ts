import { adminClient } from '@/lib/supabase/server';

// Signed links to stored files, reused while they're fresh. Signing a new link on every page load costs a round trip
// to storage and, because each link is different, stops the browser and CDN from reusing the picture it already has.
// So a link is kept and handed out again until it's within an hour of expiring.
type Entry = { url: string; until: number };
const cache = new Map<string, Entry>();
const MAX = 20_000;
const SPARE = 3600_000; // hand a link out only while it has at least an hour left

export async function signMany(bucket: string, paths: string[], seconds = 6 * 3600): Promise<{ data: { path: string | null; signedUrl: string }[] }> {
  const now = Date.now(); const ttl = Math.max(seconds, 6 * 3600);
  const want = [...new Set(paths.filter(Boolean))];
  const out: { path: string; signedUrl: string }[] = [];
  const missing: string[] = [];
  for (const p of want) { const e = cache.get(bucket + ':' + p); if (e && e.until - now > SPARE) out.push({ path: p, signedUrl: e.url }); else missing.push(p); }
  if (missing.length) {
    const { data } = await adminClient().storage.from(bucket).createSignedUrls(missing, ttl);
    for (const d of data || []) if (d.path && d.signedUrl) { cache.set(bucket + ':' + d.path, { url: d.signedUrl, until: now + ttl * 1000 }); out.push({ path: d.path, signedUrl: d.signedUrl }); }
    if (cache.size > MAX) for (const k of [...cache.keys()].slice(0, cache.size - MAX)) cache.delete(k);
  }
  return { data: out };
}
export async function signOne(bucket: string, path: string, seconds = 6 * 3600): Promise<{ data: { signedUrl: string } | null }> {
  const { data } = await signMany(bucket, [path], seconds);
  return { data: data[0] ? { signedUrl: data[0].signedUrl } : null };
}
