import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKey, splitNames, parsePrice, compareText } from '../../src/model/text.js';

test('大文字小文字・全角半角を無視したキー', () => {
  assert.equal(normalizeKey('ＬＩＶＥ　2025 '), 'live 2025');
  assert.equal(normalizeKey('ｶﾀｶﾅ'), 'カタカナ');
  assert.equal(normalizeKey(null), '');
});

test('出演者欄を日本語・英字の区切りで分けて前後の空白を除く', () => {
  assert.deepEqual(splitNames(' Aさん、Bさん,Cさん，Dさん\nEさん '), ['Aさん', 'Bさん', 'Cさん', 'Dさん', 'Eさん']);
});

test('空欄と、大文字小文字・全角半角だけ違う重複を除く', () => {
  assert.deepEqual(splitNames('abc、、ＡＢＣ, ABC ,def'), ['abc', 'def']);
  assert.deepEqual(splitNames('  '), []);
});

for (const [text, expected] of [['8800', 8800], ['8,800円', 8800], ['¥12,000', 12000], ['￥12,000', 12000], ['８８００', 8800], ['', null], ['なし', null]]) {
  test(`価格「${text}」→ ${expected}`, () => assert.equal(parsePrice(text), expected));
}

test('表示順は英字→かな→漢字、数字は数として比べる', () => {
  const sorted = ['漢字', 'かな', 'Zeta', 'alpha', 'item10', 'item2'].sort(compareText);
  assert.deepEqual(sorted, ['alpha', 'item2', 'item10', 'Zeta', 'かな', '漢字']);
});
