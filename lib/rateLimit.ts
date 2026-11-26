import { headers } from 'next/headers';
import { adminClient } from '@/lib/supabase/server';

// Rate limits for anything that sends email, checks a sign-in code or spends AI: generous enough that nobody using
// the platform normally ever meets one, tight enough to stop a script. Counters live in the database (migration
// 0019), so they hold across Vercel's servers. If that table isn't there yet, or the database can't be reached,
// requests are let through: a limit should never be what stops someone signing in.

/** Counts one go against `key` and says whether it's still within `limit` per `windowSeconds` */
export async function allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await adminClient().rpc('hit_rate_limit', { p_key: key.slice(0, 200), p_limit: limit, p_window_seconds: windowSeconds });
    if (error) return true;
    if (Math.random() < 0.01) void adminClient().from('rate_limits').delete().lt('reset_at', new Date(Date.now() - 864e5).toISOString()).then(() => null, () => null);
    return data !== false;
  } catch { return true; }
}

/** Every limit must pass (each one is counted) */
export async function allowAll(checks: [key: string, limit: number, windowSeconds: number][]) {
  const ok = await Promise.all(checks.map(([k, l, w]) => allow(k, l, w)));
  return ok.every(Boolean);
}

/** The visitor's address as Vercel reports it (its own header, which visitors can't set), for per-address limits */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-vercel-forwarded-for') || h.get('x-real-ip') || h.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
}

/** Plain JSON 429 for API routes */
export const tooMany = (message = 'That’s a lot of requests in a short time. Wait a moment, then try again.') =>
  Response.json({ error: message }, { status: 429, headers: { 'Retry-After': '60' } });
