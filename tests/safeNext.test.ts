import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeBack, safeNext } from '../lib/safeNext.ts';

test('keeps ordinary paths on this site', () => {
  assert.equal(safeNext('/p/tileyard'), '/p/tileyard');
  assert.equal(safeNext('/studio/projects/1?tab=pdf#x'), '/studio/projects/1?tab=pdf#x');
  assert.equal(safeNext('/'), '/');
});

test('refuses other sites, however they are written', () => {
  for (const bad of ['//evil.com', '/\\evil.com', '/%2F%2Fevil.com', '/%5Cevil.com', 'https://evil.com', 'http:evil.com', 'javascript:alert(1)', '', ' /p/x', '/\tevil', '\\\\evil.com', '/%2fevil.com/..%2f..%2f%2fevil.com'])
    assert.equal(safeNext(bad, '/'), '/', bad);
  assert.equal(safeNext(undefined), '/');
  assert.equal(safeNext('//evil.com', '/p/x'), '/p/x');
});

test('back is only a sign-in page or invite link', () => {
  assert.equal(safeBack('/login'), '/login');
  assert.equal(safeBack('/login/tileyard'), '/login/tileyard');
  assert.equal(safeBack('/join/abc_123-x'), '/join/abc_123-x');
  assert.equal(safeBack('https://evil.com'), '/login');
  assert.equal(safeBack('//evil.com/login'), '/login');
  assert.equal(safeBack('/studio'), '/login');
});
