import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessCategory, categoryFromAnswer } from '../../src/model/category.js';

for (const [text, expected] of [
  ["NOEL GALLAGHER'S HIGH FLYING BIRDS\n2023 JAPAN TOUR", 'ライブ'],
  ['サンプルバンド LIVE TOUR 2026', 'ライブ'],
  ['劇団サンプル 冬公演「架空の物語」', '演劇'],
  ['ミュージカル『架空の王国』', 'ミュージカル'],
  ['サンプル交響楽団 定期演奏会', 'クラシック'],
  ['架空の美術展 東京会場', '展示会'],
  ['サンプル寄席 漫才と落語の会', 'お笑い'],
  ['サンプルFC vs テストユナイテッド', 'スポーツ'],
  ['北斎展 2026', '展示会'],
]) {
  test(`推測：${text.replace('\n', ' ')} → ${expected}`, () => assert.equal(guessCategory(text), expected));
}

test('手がかりがなければ推測しない', () => {
  assert.equal(guessCategory('サンプル 2026年10月10日 横浜'), null);
});

test('限定的なカテゴリーを優先する', () => {
  assert.equal(guessCategory('ミュージカル LIVE 2026'), 'ミュージカル');
});

for (const [answer, expected] of [['ライブ', 'ライブ'], ['コンサート', 'ライブ'], ['舞台', '演劇'], ['演劇', '演劇'], ['展覧会', '展示会'], ['よく分からない種類', 'その他'], [' ミュージカル ', 'ミュージカル']]) {
  test(`答え「${answer}」→ ${expected}`, () => assert.equal(categoryFromAnswer(answer), expected));
}
