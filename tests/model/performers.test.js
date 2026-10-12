import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findPerformer, resolvePerformers, mergePerformer, orphanPerformerIds, performerNamesOf, parseAliases, comparePerformers,
} from '../../src/model/performers.js';

const performer = (id, name, { reading = '', aliases = [] } = {}) => ({ id, name, reading, aliases });
const ticket = (id, performerIds) => ({ id, performerIds });
const sequentialIds = () => {
  let n = 0;
  return () => `new-${++n}`;
};

test('名前・別名で既存の出演者に解決する（大文字小文字・全角半角を無視）', () => {
  const band = performer('p1', 'Mr.Children', { aliases: ['ミスチル'] });
  const { ids, created } = resolvePerformers('ミスチル、ｍｒ．ｃｈｉｌｄｒｅｎ', [band], sequentialIds());
  // 名前と別名の2つを入れても、同じ1人になる
  assert.deepEqual(ids, ['p1']);
  assert.deepEqual(created, []);
});

test('見つからない名前は新しく作り、同じ入力内の重複も1人にまとめる', () => {
  const existing = performer('p1', '既存');
  const { ids, created } = resolvePerformers('新人、既存、新人', [existing], sequentialIds());
  assert.deepEqual(ids, ['new-1', 'p1']);
  assert.deepEqual(created, [performer('new-1', '新人')]);
});

test('空の名前では見つからない', () => {
  assert.equal(findPerformer([performer('p1', 'A')], '  '), null);
});

test('統合：半券を付け替え、元の名前と別名を統合先の別名に残す', () => {
  const target = performer('t', 'Mr.Children', { aliases: ['ミスチル'] });
  const source = performer('s', 'ミスターチルドレン', { aliases: ['みすちる', 'ミスチル'] });
  const tickets = [ticket('only-source', ['s']), ticket('both', ['s', 't']), ticket('unrelated', ['x'])];
  const result = mergePerformer(source, target, tickets);
  assert.deepEqual(result.target.aliases, ['ミスチル', 'ミスターチルドレン', 'みすちる']);
  assert.deepEqual(result.tickets, [ticket('only-source', ['t']), ticket('both', ['t'])]);
  // 元のデータは書き換えない
  assert.deepEqual(target.aliases, ['ミスチル']);
  assert.deepEqual(tickets[0].performerIds, ['s']);
});

test('自分自身への統合は何もしない', () => {
  const p = performer('p', 'A');
  assert.deepEqual(mergePerformer(p, p, [ticket('1', ['p'])]).tickets, []);
});

test('どの半券にも紐づかない出演者を見つける', () => {
  const performers = [performer('kept', '残る'), performer('orphan', '消える')];
  assert.deepEqual(orphanPerformerIds(performers, [ticket('1', ['kept'])]), ['orphan']);
  assert.deepEqual(orphanPerformerIds(performers, []), ['kept', 'orphan']);
});

test('半券の出演者名は名前順', () => {
  const byId = new Map([['b', performer('b', 'B')], ['a', performer('a', 'A')]]);
  assert.deepEqual(performerNamesOf(ticket('1', ['b', 'a', 'gone']), byId), ['A', 'B']);
});

test('別名欄から名前と同じものを除く', () => {
  assert.deepEqual(parseAliases('ミスチル、MR.CHILDREN、みすちる', 'Mr.Children'), ['ミスチル', 'みすちる']);
});

test('出演者はよみがあればよみ、なければ名前で並べる', () => {
  const list = [performer('1', 'Zeta'), performer('2', '漢字バンド', { reading: 'かんじばんど' }), performer('3', 'alpha')];
  assert.deepEqual(list.sort(comparePerformers).map((p) => p.name), ['alpha', 'Zeta', '漢字バンド']);
});
