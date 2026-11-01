import { resolveCname, resolve4 } from 'node:dns/promises';
import { adminClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

// The platform's own address, e.g. platform.lostproperty.studio, with each portal at platform.lostproperty.studio/<slug>.
export type DomainSetting = { host: string; live?: boolean; checkedAt?: string };
export const DEFAULT_HOST = 'platform.lostproperty.studio';

export async function getDomain(): Promise<DomainSetting | null> {
  const { data } = await adminClient().from('studio_settings').select('value').eq('key', 'domain').maybeSingle();
  return (data?.value as DomainSetting) || null;
}

/** The address to share for a portal: the studio's own domain once it's live, otherwise the current one */
export async function portalUrl(slug: string) {
  const d = await getDomain().catch(() => null);
  if (d?.live) return `https://${d.host}/${slug}`;
  // Otherwise the address the studio is using right now (only the platform's own addresses count)
  const { appOrigin } = await import('@/lib/origin');
  return `${await appOrigin()}/${slug}`;
}

const within = <T,>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p.catch(() => fallback), new Promise<T>((ok) => setTimeout(() => ok(fallback), ms))]);

/** Checks each step of putting the platform on the domain */
export async function checkDomain(host: string) {
  const [cname, a] = await Promise.all([within(resolveCname(host), 4000, [] as string[]), within(resolve4(host), 4000, [] as string[])]);
  const dns = cname.some((c) => /vercel-dns(-\d+)?\.com\.?$/i.test(c)) || a.some((ip) => ip === '76.76.21.21' || ip.startsWith('76.76.21.'));
  const health = await within(fetch(`https://${host}/api/health`, { cache: 'no-store', redirect: 'manual' }).then(async (r) => (r.ok ? ((await r.json().catch(() => null)) as { ok?: unknown } | null) : null)), 6000, null);
  const serving = !!health && typeof health === 'object';
  const appUrlSet = (() => { try { return new URL(env.appUrl()).hostname === host; } catch { return false; } })();
  return { dns, records: [...cname.map((c) => `CNAME ${c}`), ...a.map((ip) => `A ${ip}`)], serving, appUrlSet, vercelApi: !!(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID) };
}

/** Adds the domain to the Vercel project, when the platform has a Vercel token */
export async function addToVercel(host: string) {
  const token = process.env.VERCEL_TOKEN, project = process.env.VERCEL_PROJECT_ID, team = process.env.VERCEL_TEAM_ID;
  if (!token || !project) throw new Error('Add VERCEL_TOKEN and VERCEL_PROJECT_ID to the platform’s environment variables first.');
  const r = await fetch(`https://api.vercel.com/v10/projects/${project}/domains${team ? `?teamId=${team}` : ''}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: host }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && j?.error?.code !== 'domain_already_in_use' && j?.error?.code !== 'domain_already_exists') throw new Error(j?.error?.message || `Vercel said ${r.status}`);
}
