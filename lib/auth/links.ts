import { appOrigin } from '@/lib/origin';
import { adminClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

/** Finds the account for an email, or creates it (already confirmed: the email we send proves the address). */
export async function ensureUser(email: string) {
  const sb = adminClient();
  const clean = email.trim().toLowerCase();
  const { data: made } = await sb.auth.admin.createUser({ email: clean, email_confirm: true });
  if (made?.user) return made.user;
  for (let page = 1; page < 20; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    const u = data?.users.find((x) => x.email?.toLowerCase() === clean);
    if (u) return u;
    if (!data || data.users.length < 200) break;
  }
  throw new Error('Couldn’t find or create that account.');
}

/** A one-time sign-in link to our own page, for emails the platform sends itself (instead of Supabase's). */
export async function signInUrl(email: string, next: string) {
  const sb = adminClient();
  const clean = email.trim().toLowerCase();
  let { data, error } = await sb.auth.admin.generateLink({ type: 'magiclink', email: clean });
  if (error || !data?.properties?.hashed_token) { await ensureUser(clean); ({ data, error } = await sb.auth.admin.generateLink({ type: 'magiclink', email: clean })); }
  if (error || !data?.properties?.hashed_token) throw new Error(error?.message || 'Couldn’t create a sign-in link.');
  const safeNext = next.startsWith('/') ? next : '/';
  return { url: `${await appOrigin()}/auth/verify?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent(safeNext)}`, user: data.user };
}
