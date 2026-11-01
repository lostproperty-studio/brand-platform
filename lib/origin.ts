import { headers } from 'next/headers';
import { env } from '@/lib/env';
import { DEFAULT_HOST } from '@/lib/domain';
import { adminClient } from '@/lib/supabase/server';

// The address someone is using right now, so links we make (sign-in emails, invites, redirects) keep them on it:
// sign in on platform.lostproperty.studio and you come back to platform.lostproperty.studio.
// Only the platform's own addresses are trusted; anything else in the request falls back to the main address,
// so a forged Host header can't put someone else's domain into a sign-in email.
export async function appOrigin(): Promise<string> {
  const fallback = env.appUrl().replace(/\/$/, '');
  try {
    const h = await headers();
    const host = (h.get('x-forwarded-host') || h.get('host') || '').split(',')[0].trim().toLowerCase();
    if (!host) return fallback;
    const known = new Set([new URL(fallback).host, DEFAULT_HOST, process.env.VERCEL_PROJECT_PRODUCTION_URL || '']);
    const { data } = await adminClient().from('studio_settings').select('value').eq('key', 'domain').maybeSingle();
    const saved = (data?.value as { host?: string } | null)?.host; if (saved) known.add(saved);
    if (!known.has(host)) return fallback;
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
    return `${local ? 'http' : 'https'}://${host}`;
  } catch { return fallback; }
}
