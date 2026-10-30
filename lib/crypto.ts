import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';

// AES-256-GCM for clients' AI keys at rest. Output: base64(iv | tag | ciphertext).
// Uses KEY_ENCRYPTION_SECRET when set; otherwise derives a key from the Supabase JWT secret Vercel already holds.
// Note: rotating the Supabase JWT secret without setting KEY_ENCRYPTION_SECRET means clients re-enter their AI key.
const key = () => {
  const explicit = process.env.KEY_ENCRYPTION_SECRET;
  if (explicit) { const k = Buffer.from(explicit, 'base64'); if (k.length !== 32) throw new Error('KEY_ENCRYPTION_SECRET must be 32 bytes, base64'); return k; }
  const base = process.env.SUPABASE_JWT_SECRET;
  if (!base) throw new Error('Set KEY_ENCRYPTION_SECRET (or SUPABASE_JWT_SECRET) to store client AI keys.');
  return Buffer.from(hkdfSync('sha256', base, 'lost-property-brand-platform', 'client-ai-keys', 32));
};

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
export function decryptSecret(blob: string): string {
  const b = Buffer.from(blob, 'base64');
  const d = createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
export const newToken = () => 'lpk_' + randomBytes(24).toString('base64url');
