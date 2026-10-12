import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AI_PROMPT, FIELD_LABELS, parseAIAnswer, parseDate, parseTime, normalizeWidth } from '../../src/model/ai-format.js';
import { CATEGORIES } from '../../src/model/category.js';

test('指示文はすべての項目名を順に並べ、カテゴリーの選択肢を伝える', () => {
  const labels = AI_PROMPT.split('\n').filter((l) => l.endsWith(':')).map((l) => l.slice(0, -1));
  assert.deepEqual(labels, FIELD_LABELS);
  for (const c of CATEGORIES) assert.ok(AI_PROMPT.includes(c), c);
});

test('指示どおりの形式の答えを読む', () => {
  const answer = `公演名: FLOGGING MOLLY
カテゴリー: ライブ
ツアー名: JAPAN TOUR 2005
出演者: Flogging Molly
公演日: 2005-09-29
開場: 18:00
開演: 19:00
会場: LIQUIDROOM
階:
ブロック:
列:
番号:
ゲート・扉:
席その他: 立見 整理番号 A779
価格: 4700
発券元: チケットぴあ`;
  const { parsed, values } = parseAIAnswer(answer);
  assert.equal(parsed.title, 'FLOGGING MOLLY');
  assert.equal(parsed.category, 'ライブ');
  assert.equal(parsed.subtitle, 'JAPAN TOUR 2005');
  assert.deepEqual(parsed.performerNames, ['Flogging Molly']);
  assert.equal(parsed.performanceDate, '2005-09-29');
  assert.equal(parsed.openTime, '18:00');
  assert.equal(parsed.startTime, '19:00');
  assert.equal(parsed.venue, 'LIQUIDROOM');
  assert.equal(parsed.seat.floor, null);
  assert.equal(parsed.seat.note, '立見 整理番号 A779');
  assert.equal(parsed.price, 4700);
  assert.equal(parsed.issuer, 'チケットぴあ');
  // 空の項目は数えない
  assert.equal(values.length, 11);
});

test('前置き・コードブロック・箇条書き・太字・全角コロンを許容する', () => {
  const answer = `読み取った内容は次のとおりです。
\`\`\`
- **公演名**：サンプル公演
- カテゴリー：舞台
- 出演者：バンドA、ゲストB
- 公演日：2026/11/3
- 開演：6:30 PM
- 価格：¥9,800
- 列：C
\`\`\`
ほかに不明な点はありません。`;
  const { parsed } = parseAIAnswer(answer);
  assert.equal(parsed.title, 'サンプル公演');
  // 選択肢にない言い方は、同じ意味のカテゴリーにそろえる
  assert.equal(parsed.category, '演劇');
  assert.deepEqual(parsed.performerNames, ['バンドA', 'ゲストB']);
  assert.equal(parsed.performanceDate, '2026-11-03');
  assert.equal(parsed.startTime, '18:30');
  assert.equal(parsed.price, 9800);
  assert.equal(parsed.seat.row, 'C');
  assert.equal(parsed.venue, null);
});

test('「不明」「なし」「-」「ー」は空として扱う', () => {
  const { parsed, values } = parseAIAnswer('公演名: A\n会場: 不明\n列: -\n番号: ー\n発券元: なし');
  assert.equal(parsed.venue, null);
  assert.equal(parsed.issuer, null);
  assert.deepEqual(values, [['公演名', 'A']]);
});

test('項目名の行がなければ null', () => {
  assert.equal(parseAIAnswer('こんにちは。今日はいい天気ですね。'), null);
  assert.equal(parseAIAnswer(''), null);
  // 知らない項目名だけ
  assert.equal(parseAIAnswer('氏名: 山田太郎\n電話: 000'), null);
});

test('とても長い・崩れた答えでも固まらずに読む（ChatGPT で起きた不具合への備え）', () => {
  const noise = 'あ'.repeat(5000) + ':' + '\n'.repeat(2000) + '公演名: 見つかる\n' + 'x'.repeat(100000);
  const started = performance.now();
  const result = parseAIAnswer(noise);
  assert.ok(performance.now() - started < 500);
  assert.equal(result.parsed.title, '見つかる');
});

for (const [text, expected] of [
  ['2026年10月10日', '2026-10-10'], ['令和8年1月15日', '2026-01-15'], ['平成元年5月1日', '1989-05-01'],
  ['2026/10/10', '2026-10-10'], ['2026.10.10(土)', '2026-10-10'], ['2005 9 29', '2005-09-29'], ['２０２６－１０－１０', '2026-10-10'],
  ['2026/13/01', null], ['1800/01/01', null], ['日付なし', null],
]) {
  test(`日付「${text}」→ ${expected}`, () => assert.equal(parseDate(text), expected));
}

for (const [text, expected] of [
  ['18:00', '18:00'], ['18時30分', '18:30'], ['6:30 PM', '18:30'], ['6:30pm', '18:30'], ['午後6時30分', '18:30'],
  ['12:00 AM', '00:00'], ['１８：００', '18:00'], ['18時', '18:00'], ['25:00', null], ['なし', null],
]) {
  test(`時刻「${text}」→ ${expected}`, () => assert.equal(parseTime(text), expected));
}

test('全角英数字・記号を半角に（カタカナはそのまま）', () => {
  assert.equal(normalizeWidth('ＡＢＣ：１２３　カナ￥'), 'ABC:123 カナ¥');
});
