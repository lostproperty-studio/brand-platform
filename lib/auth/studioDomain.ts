import { env } from '@/lib/env';

type U = { email?: string | null; email_confirmed_at?: string | null; app_metadata?: { provider?: string; providers?: string[] } };

/** Whether a signed-in person counts as studio staff by their email address alone: an address on the studio's
 *  domain that's been confirmed, from an email sign-in link or Google. Never a password sign-up or another provider,
 *  which could carry an address nobody proved they own. */
export function studioByDomain(u: U | null | undefined) {
  if (!u?.email || !u.email_confirmed_at) return false;
  if (!env.studioDomains().includes(u.email.split('@')[1]?.toLowerCase())) return false;
  const providers = [u.app_metadata?.provider, ...(u.app_metadata?.providers || [])].filter(Boolean) as string[];
  return providers.length > 0 && providers.every((p) => p === 'email' || p === 'google');
}
