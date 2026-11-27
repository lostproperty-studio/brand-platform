import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret } from '../lib/crypto.ts';

test('adding KEY_ENCRYPTION_SECRET later keeps old secrets readable, and new ones use it', () => {
  delete process.env.KEY_ENCRYPTION_SECRET;
  process.env.SUPABASE_JWT_SECRET = 'jwt-secret-for-tests';
  const old = encryptSecret('sk-ant-old');
  process.env.KEY_ENCRYPTION_SECRET = randomBytes(32).toString('base64');
  assert.equal(decryptSecret(old), 'sk-ant-old');
  const fresh = encryptSecret('sk-ant-new');
  assert.equal(decryptSecret(fresh), 'sk-ant-new');
  // The new one really uses the new key: without it, it can't be read
  const saved = process.env.KEY_ENCRYPTION_SECRET; delete process.env.KEY_ENCRYPTION_SECRET;
  assert.throws(() => decryptSecret(fresh));
  process.env.KEY_ENCRYPTION_SECRET = saved;
});

test('a wrong or tampered secret is refused', () => {
  process.env.KEY_ENCRYPTION_SECRET = randomBytes(32).toString('base64');
  const blob = Buffer.from(encryptSecret('hello'), 'base64'); blob[blob.length - 1] ^= 1;
  assert.throws(() => decryptSecret(blob.toString('base64')));
});
