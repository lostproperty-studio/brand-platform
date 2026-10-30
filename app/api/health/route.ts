import { App } from 'octokit';
import { studioAnthropic } from '@/lib/ai/studio';
import { env } from '@/lib/env';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Setup check: says whether each connection works. Never returns secret values.
async function check(fn: () => Promise<string>) {
  try { return { ok: true, detail: await fn() }; } catch (e) { return { ok: false, detail: String((e as Error).message || e).slice(0, 160) }; }
}

export async function GET() {
  const [supabase, github, figma, anthropic] = await Promise.all([
    check(async () => { const s = createClient(env.supabaseUrl(), env.supabaseService()); const { error, count } = await s.from('projects').select('id', { count: 'exact', head: true }); if (error) throw new Error(error.message); return `${count ?? 0} projects`; }),
    check(async () => { const g = env.github(); const pem = g.privateKey; if (!pem.includes('-----BEGIN')) throw new Error(`private key doesn’t look like a .pem file (${pem.length} chars, starts “${pem.slice(0, 6)}”)`); const app = new App({ appId: g.appId, privateKey: g.privateKey }); const kit = await app.getInstallationOctokit(g.installationId); const { data } = await kit.rest.apps.listReposAccessibleToInstallation({ per_page: 1 }); return `installed, ${data.total_count} repos visible`; }),
    check(async () => { const t = env.figmaToken(); const r = await fetch('https://api.figma.com/v1/files/T5NgfMUus0JuBz1HAito3g?depth=1', { headers: { 'X-Figma-Token': t } }); if (!r.ok) throw new Error(`Figma said ${r.status}: ${(await r.text()).slice(0, 100)} (token starts ${t.slice(0, 5)}, ${t.length} chars)`); const f = await r.json(); return `can read “${f.name}”`; }),
    check(async () => { await studioAnthropic().models.list({ limit: 1 }); return 'key accepted'; })
  ]);
  const encryption = { ok: !!(process.env.KEY_ENCRYPTION_SECRET || process.env.SUPABASE_JWT_SECRET), detail: '' };
  return Response.json({ supabase, github, figma, anthropic, encryption });
}
