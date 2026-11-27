import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';

// AES-256-GCM for clients' AI keys (and other stored secrets) at rest. Output: base64(iv | tag | ciphertext).
// Keys, in order: KEY_ENCRYPTION_SECRET when it's set (32 bytes, base64), then one derived from the Supabase JWT
// secret, which is what the platform used before KEY_ENCRYPTION_SECRET existed. New secrets are encrypted with the
// first; reading tries each, so adding KEY_ENCRYPTION_SECRET later never makes stored secrets unreadable (they're
// re-encrypted with it the next time they're saved).
function keys(): Buffer[] {
  const out: Buffer[] = [];
  const explicit = process.env.KEY_ENCRYPTION_SECRET;
  if (explicit) { const k = Buffer.from(explicit, 'base64'); if (k.length !== 32) throw new Error('KEY_ENCRYPTION_SECRET must be 32 bytes, base64'); out.push(k); }
  const base = process.env.SUPABASE_JWT_SECRET;
  if (base) out.push(Buffer.from(hkdfSync('sha256', base, 'lost-property-brand-platform', 'client-ai-keys', 32)));
  if (!out.length) throw new Error('Set KEY_ENCRYPTION_SECRET (or SUPABASE_JWT_SECRET) to store client AI keys.');
  return out;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keys()[0], iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
export function decryptSecret(blob: string): string {
  const b = Buffer.from(blob, 'base64');
  let last: unknown;
  for (const k of keys()) {
    try {
      const d = createDecipheriv('aes-256-gcm', k, b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
    } catch (e) { last = e; }
  }
  throw last;
}
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
export const newToken = () => 'lpk_' + randomBytes(24).toString('base64url');
