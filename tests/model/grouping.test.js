import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupTickets, viewableTickets, filterTickets } from '../../src/model/grouping.js';

let seq = 0;
const ticket = (title, date, fields = {}) => ({
  id: `t${++seq}`, title, performanceDate: date, performerIds: [], subtitle: '', category: '', venue: '', comment: '',
  startTime: null, hasImage: false, createdAt: `2026-01-01T00:00:${String(seq).padStart(2, '0')}Z`, ...fields,
});
const performer = (id, name, { reading = '', aliases = [] } = {}) => ({ id, name, reading, aliases });
const byId = (...ps) => new Map(ps.map((p) => [p.id, p]));
const titles = (s) => s.tickets.map((t) => t.title);

test('公演日の新しい順・古い順', () => {
  const tickets = [ticket('B', '2025-05-01'), ticket('C', '2026-01-01'), ticket('A', '2024-03-01')];
  const newest = groupTickets(tickets, 'newest', new Map());
  const oldest = groupTickets(tickets, 'oldest', new Map());
  assert.deepEqual(newest.map((s) => s.title), [null]);
  assert.deepEqual(titles(newest[0]), ['C', 'B', 'A']);
  assert.deepEqual(titles(oldest[0]), ['A', 'B', 'C']);
});

test('同じ日は開演の遅い順', () => {
  const tickets = [ticket('昼', '2026-01-01', { startTime: '13:00' }), ticket('夜', '2026-01-01', { startTime: '18:00' })];
  assert.deepEqual(titles(groupTickets(tickets, 'newest', new Map())[0]), ['夜', '昼']);
});

test('年ごと：新しい年から、見出しに件数', () => {
  const tickets = [ticket('A', '2025-02-01'), ticket('B', '2026-01-01'), ticket('C', '2025-11-01')];
  const sections = groupTickets(tickets, 'byYear', new Map());
  assert.deepEqual(sections.map((s) => s.title), ['2026年（1）', '2025年（2）']);
  assert.deepEqual(titles(sections[1]), ['C', 'A']);
});

test('出演者ごと：よみ順、複数出演の半券は各出演者の下に、出演者なしは最後', () => {
  const zeta = performer('z', 'Zeta');
  const kanji = performer('k', '漢字バンド', { reading: 'かんじばんど' });
  const alpha = performer('a', 'alpha');
  const tickets = [
    ticket('対バン', '2026-01-01', { performerIds: ['z', 'a'] }),
    ticket('ワンマン', '2025-01-01', { performerIds: ['k'] }),
    ticket('出演者未入力', '2024-01-01'),
  ];
  const sections = groupTickets(tickets, 'byPerformer', byId(zeta, kanji, alpha));
  assert.deepEqual(sections.map((s) => s.title), ['alpha（1）', 'Zeta（1）', '漢字バンド（1）', '出演者なし（1）']);
  assert.deepEqual(titles(sections[0]), ['対バン']);
  assert.deepEqual(titles(sections[1]), ['対バン']);
});

test('カテゴリーごと：選択肢の順、選択肢にない値はその後、未設定は最後', () => {
  const tickets = [
    ticket('舞台', '2025-01-01', { category: '演劇' }),
    ticket('ライブ1', '2024-01-01', { category: 'ライブ' }),
    ticket('ライブ2', '2026-01-01', { category: 'ライブ' }),
    ticket('未設定', '2026-05-01'),
    ticket('古い分類', '2026-02-01', { category: 'イベント' }),
  ];
  const sections = groupTickets(tickets, 'byCategory', new Map());
  assert.deepEqual(sections.map((s) => s.title), ['ライブ（2）', '演劇（1）', 'イベント（1）', '未設定（1）']);
  assert.deepEqual(titles(sections[0]), ['ライブ2', 'ライブ1']);
});

test('検索：公演名・会場・コメント・出演者の別名。大文字小文字・全角半角は区別しない', () => {
  const band = performer('b', 'Mr.Children', { aliases: ['ミスチル'] });
  const a = ticket('ドームツアー', '2026-01-01', { performerIds: ['b'] });
  const b = ticket('ＬＩＶＥ 2025', '2025-01-01', { venue: '日本武道館' });
  const c = ticket('ホールツアー', '2024-01-01', { comment: 'アンコールが最高' });
  const tickets = [a, b, c];
  const search = (q) => filterTickets(tickets, q, byId(band)).map((t) => t.title);
  assert.deepEqual(search('ミスチル'), ['ドームツアー']);
  assert.deepEqual(search('mr.children'), ['ドームツアー']);
  assert.deepEqual(search('live'), ['ＬＩＶＥ 2025']);
  assert.deepEqual(search('武道館'), ['ＬＩＶＥ 2025']);
  assert.deepEqual(search('アンコール'), ['ホールツアー']);
  assert.equal(search('  ').length, 3);
  assert.deepEqual(search('存在しない'), []);
});

test('検索：カテゴリー', () => {
  const ex = ticket('架空の美術展', '2026-01-01', { category: '展示会' });
  const other = ticket('ライブ', '2025-01-01');
  assert.deepEqual(filterTickets([ex, other], '展示会', new Map()).map((t) => t.title), ['架空の美術展']);
});

test('めくる画面：並び順のまま、画像のある半券だけを1回ずつ', () => {
  const band = performer('b', 'バンド');
  const guest = performer('g', 'ゲスト');
  const shared = ticket('対バン', '2026-01-01', { performerIds: ['b', 'g'], hasImage: true });
  const solo = ticket('ワンマン', '2025-01-01', { performerIds: ['b'], hasImage: true });
  const noImage = ticket('画像なし', '2024-01-01', { performerIds: ['g'] });
  // 出演者ごとの表示では「対バン」が2回出る
  const sections = groupTickets([shared, solo, noImage], 'byPerformer', byId(band, guest));
  assert.deepEqual(viewableTickets(sections).map((t) => t.title), ['対バン', 'ワンマン']);
});

test('会場ごと：会場名の順、見出しに件数、全角半角・大文字小文字だけ違う会場は1つに、会場なしは最後', () => {
  const tickets = [
    ticket('A', '2026-01-01', { venue: '日本武道館' }),
    ticket('B', '2025-01-01', { venue: 'Zepp Haneda' }),
    ticket('C', '2024-01-01', { venue: 'ＺＥＰＰ　Ｈａｎｅｄａ' }),
    ticket('D', '2023-01-01', { venue: '  日本武道館 ' }),
    ticket('E', '2022-01-01', { venue: 'Zepp Haneda' }),
    ticket('F', '2021-01-01'),
  ];
  const sections = groupTickets(tickets, 'byVenue', new Map());
  // 表記が分かれたときは、いちばん多い書き方を見出しにする
  assert.deepEqual(sections.map((s) => s.title), ['Zepp Haneda（3）', '日本武道館（2）', '会場なし（1）']);
  assert.deepEqual(titles(sections[0]), ['B', 'C', 'E']);
});
