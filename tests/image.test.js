import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitSize, ORIGINAL_MAX_SIDE, THUMBNAIL_MAX_SIDE } from '../src/image.js';

test('長辺を上限に合わせて縦横比を保つ', () => {
  assert.deepEqual(fitSize(4032, 3024, ORIGINAL_MAX_SIDE), { width: 2000, height: 1500 });
  assert.deepEqual(fitSize(3024, 4032, THUMBNAIL_MAX_SIDE), { width: 450, height: 600 });
});

test('小さい画像は拡大しない', () => {
  assert.deepEqual(fitSize(800, 600, ORIGINAL_MAX_SIDE), { width: 800, height: 600 });
});

test('極端に細長くても 0 にならない', () => {
  assert.deepEqual(fitSize(10000, 1, THUMBNAIL_MAX_SIDE), { width: 600, height: 1 });
});
