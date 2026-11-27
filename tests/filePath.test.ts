import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativeUploadName, safeRelPath } from '../lib/filePath.ts';

test('folders are kept', () => {
  assert.equal(safeRelPath('Dense/Tileyard_DotGrid_Dense_3x2_1920x1280.png'), 'Dense/Tileyard_DotGrid_Dense_3x2_1920x1280.png');
  assert.equal(safeRelPath('Open/9x16/a b.png'), 'Open/9x16/a-b.png');
  assert.equal(safeRelPath('plain.png'), 'plain.png');
});

test('paths can never leave the package', () => {
  assert.equal(safeRelPath('../../x.png'), 'x.png');
  assert.equal(safeRelPath('a/../../b/./c.png'), 'a/b/c.png');
  assert.equal(safeRelPath('..\\..\\x.png'), 'x.png');
  assert.equal(safeRelPath('/abs/x.png'), 'abs/x.png');
  assert.equal(safeRelPath(''), 'file');
  assert.equal(safeRelPath('a/b/c/d/e/f/g/h/x.png').split('/').length, 7);
});

test('a folder upload drops the chosen folder itself, keeps the rest', () => {
  assert.equal(relativeUploadName({ name: 'x.png', webkitRelativePath: 'Graphic language/Dense/x.png' }), 'Dense/x.png');
  assert.equal(relativeUploadName({ name: 'x.png', webkitRelativePath: 'Graphic language/x.png' }), 'x.png');
  assert.equal(relativeUploadName({ name: 'x.png' }), 'x.png');
});
