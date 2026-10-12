import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampOffset, containSize } from '../src/views/zoom-math.js';

const container = { width: 400, height: 800 };

test('縦長の画面に横長の画像を収めた大きさ', () => {
  assert.deepEqual(containSize({ width: 2000, height: 1000 }, container), { width: 400, height: 200 });
});

test('画像の大きさが分からないときは画面いっぱい', () => {
  assert.deepEqual(containSize({ width: 0, height: 0 }, container), container);
});

test('等倍では動かせない', () => {
  assert.deepEqual(clampOffset({ x: 50, y: -30 }, 1, { width: 400, height: 200 }, container), { x: 0, y: 0 });
});

test('拡大した分だけ動かせる。画面より小さい方向は中央のまま', () => {
  // 3倍で幅 1200（画面 400 → 左右に 400 ずつはみ出す）、高さ 600（画面 800 より小さい）
  const content = { width: 400, height: 200 };
  assert.deepEqual(clampOffset({ x: 1000, y: 500 }, 3, content, container), { x: 400, y: 0 });
  assert.deepEqual(clampOffset({ x: -1000, y: 0 }, 3, content, container), { x: -400, y: 0 });
  assert.deepEqual(clampOffset({ x: 120, y: 0 }, 3, content, container), { x: 120, y: 0 });
});
