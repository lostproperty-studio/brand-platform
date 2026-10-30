import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '@/lib/env';

// AES-256-GCM for clients' AI keys at rest. Output: base64(iv | tag | ciphertext).
const key = () => { const k = Buffer.from(env.keySecret(), 'base64'); if (k.length !== 32) throw new Error('KEY_ENCRYPTION_SECRET must be 32 bytes, base64'); return k; };

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
