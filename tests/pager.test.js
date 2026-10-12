import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextPage, dragOffset } from '../src/views/pager-math.js';

const base = { index: 2, count: 5, width: 400, velocity: 0 };

test('幅の1/4以上動かせば隣へ、足りなければ戻る', () => {
  assert.equal(nextPage({ ...base, dx: -150 }), 3);
  assert.equal(nextPage({ ...base, dx: 150 }), 1);
  assert.equal(nextPage({ ...base, dx: -60 }), 2);
});

test('短くても速く払えば隣へ', () => {
  assert.equal(nextPage({ ...base, dx: -40, velocity: -0.8 }), 3);
  // ほとんど動いていなければ速さだけでは動かない
  assert.equal(nextPage({ ...base, dx: -5, velocity: -2 }), 2);
});

test('端より先へは行かない', () => {
  assert.equal(nextPage({ ...base, index: 4, dx: -300 }), 4);
  assert.equal(nextPage({ ...base, index: 0, dx: 300 }), 0);
});

test('端で引っぱると動きが小さくなる', () => {
  assert.equal(dragOffset({ index: 0, count: 5, dx: 100 }), 30);
  assert.equal(dragOffset({ index: 4, count: 5, dx: -100 }), -30);
  assert.equal(dragOffset({ index: 2, count: 5, dx: 100 }), 100);
});
