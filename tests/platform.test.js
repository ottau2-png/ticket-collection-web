import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStandalone } from '../src/platform.js';

const media = (matches) => () => ({ matches });

test('iOS のホーム画面から開くと standalone', () => {
  assert.equal(isStandalone({ standalone: true }, media(false)), true);
});

test('display-mode が standalone なら standalone', () => {
  assert.equal(isStandalone({}, media(true)), true);
});

test('ブラウザで開いているときは standalone でない', () => {
  assert.equal(isStandalone({ standalone: false }, media(false)), false);
  assert.equal(isStandalone({}, undefined), false);
});
