import { adminClient } from '@/lib/supabase/server';
import { decryptSecret } from '@/lib/crypto';

// Krea, connected once for the studio. Generation runs through Krea's Agent API, which draws on the workspace's
// compute units (the studio's Krea plan), not the separate API balance that direct model calls use.
const BASE = 'https://api.krea.ai';
export type KreaSetting = { key: string; hint: string; at: string };

export async function kreaKey(): Promise<string | null> {
  const { data } = await adminClient().from('studio_settings').select('value').eq('key', 'krea').maybeSingle();
  const v = data?.value as KreaSetting | undefined;
  if (!v?.key) return null;
  try { return decryptSecret(v.key); } catch { return null; }
}

async function call(key: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j: Record<string, unknown> = {};
  try { j = JSON.parse(text); } catch { /* not JSON */ }
  if (!r.ok) {
    const msg = r.status === 401 || r.status === 403 ? 'Krea didn’t accept the key. Paste a new one in Admin settings.' : r.status === 402 ? 'The Krea workspace is out of compute units, or the plan doesn’t include this.' : (j.error as string) || (j.message as string) || `Krea said ${r.status}.`;
    throw new Error(msg);
  }
  return j;
}

/** A quick check that the key works: lists the workspace's custom agents */
export async function kreaCheck(key: string) { await call(key, '/agent/custom-agents'); }

type Media = { jobId?: string; mediaKind?: string; url?: string; mimeType?: string; uri?: string; name?: string };
/** Asks Krea's agent to make media, waits for it (up to the time given), and returns the output URLs */
export async function kreaMake(key: string, prompt: string, kind: 'image' | 'video' | 'audio', waitSeconds = 270): Promise<{ url: string; kind: string; mime?: string }[]> {
  const start = await call(key, '/agent/send-message', { prompt, name: `Brand Platform: ${prompt.slice(0, 80)}`, effort: 'fast' }) as { sessionId: string; runId: string };
  const until = Date.now() + waitSeconds * 1000;
  let s: { finished?: boolean; status?: string; error?: string; media?: Media[]; text?: string } = {};
  while (Date.now() < until) {
    s = await call(key, '/agent/wait-for-session', { sessionId: start.sessionId, runId: start.runId, timeoutSeconds: Math.max(1, Math.min(60, Math.floor((until - Date.now()) / 1000))) }) as typeof s;
    if (s.finished) break;
  }
  if (!s.finished) throw new Error('Krea is still working on it. Try again in a minute, or make something simpler.');
  if (s.status !== 'completed') throw new Error(s.error || 'Krea couldn’t make that. Try rewording it.');
  const out: { url: string; kind: string; mime?: string }[] = [];
  for (const m of s.media || []) {
    if (m.url) out.push({ url: m.url, kind: m.mimeType?.split('/')[0] || kind, mime: m.mimeType });
    else if (m.jobId) {
      const j = await call(key, `/jobs/${m.jobId}`) as { result?: { urls?: string[] }; data?: { urls?: string[] }; urls?: string[] };
      const u = j.result?.urls?.[0] || j.data?.urls?.[0] || j.urls?.[0];
      if (u) out.push({ url: u, kind: m.mediaKind || kind });
    }
  }
  return out.filter((x) => x.kind === kind || (kind === 'image' && /image/.test(x.kind)));
}
