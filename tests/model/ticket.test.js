import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyDraft, draftFromTicket, canSave, ticketFromDraft, withImage, withRecrop, withoutImage, fillEmptyFields, overwriteFields, localDateString,
} from '../../src/model/ticket.js';

const now = new Date('2026-10-12T09:00:00Z');

test('公演名は必須（空白だけも不可）', () => {
  const draft = emptyDraft('2026-10-12');
  assert.equal(canSave(draft), false);
  assert.equal(canSave({ ...draft, title: '   ' }), false);
  assert.equal(canSave({ ...draft, title: '公演' }), true);
});

test('新しい下書きの時刻の初期値は 17:00 開場・18:00 開演（どちらもオフ）', () => {
  const draft = emptyDraft('2026-10-12');
  assert.equal(draft.hasOpenTime, false);
  assert.equal(draft.openTime, '17:00');
  assert.equal(draft.startTime, '18:00');
});

test('端末の時刻で日付を作る', () => {
  assert.equal(localDateString(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('保存して読み直すと同じ値に戻る', () => {
  const performersById = new Map([['b', { id: 'b', name: 'B', reading: '', aliases: [] }], ['a', { id: 'a', name: 'A', reading: '', aliases: [] }]]);
  const draft = {
    ...emptyDraft('2026-10-10'),
    title: '  ツアー初日  ',
    subtitle: 'TOUR 2026',
    hasStartTime: true,
    startTime: '18:00',
    venue: '日本武道館',
    seat: { floor: '2階', block: '', row: '', number: '', gate: '', note: '南東スタンド' },
    priceText: '9,800',
    issuer: 'ぴあ',
    comment: '最高だった\nアンコール2曲',
    category: 'ライブ',
  };
  const ticket = ticketFromDraft(draft, { id: 't1', performerIds: ['b', 'a'], now });
  assert.equal(ticket.title, 'ツアー初日');
  assert.equal(ticket.openTime, null);
  assert.equal(ticket.startTime, '18:00');
  assert.equal(ticket.price, 9800);
  assert.equal(ticket.createdAt, now.toISOString());

  const reread = draftFromTicket(ticket, performersById);
  assert.equal(reread.title, 'ツアー初日');
  assert.equal(reread.performerNames, 'A、B');
  assert.equal(reread.hasOpenTime, false);
  assert.equal(reread.hasStartTime, true);
  assert.equal(reread.priceText, '9800');
  assert.equal(reread.comment, '最高だった\nアンコール2曲');
  assert.equal(reread.seat.note, '南東スタンド');
  assert.equal(reread.category, 'ライブ');
  assert.equal(reread.performanceDate, '2026-10-10');
});

test('任意の項目を消すと保存形式からも消える', () => {
  const existing = ticketFromDraft({ ...emptyDraft('2026-01-01'), title: '公演', priceText: '5000', hasOpenTime: true }, { id: 't', performerIds: [], now });
  const draft = { ...draftFromTicket(existing, new Map()), priceText: '', hasOpenTime: false };
  const later = new Date('2026-10-13T00:00:00Z');
  const saved = ticketFromDraft(draft, { id: 't', performerIds: [], existing, now: later });
  assert.equal(saved.price, null);
  assert.equal(saved.openTime, null);
  assert.equal(saved.createdAt, existing.createdAt);
  assert.equal(saved.updatedAt, later.toISOString());
});

test('新しい画像を付けると前の読み取り文字を消す。外すと画像なし', () => {
  const draft = { ...emptyDraft(), ocrText: '古い画像の文字' };
  const withImg = withImage(draft, { original: 'o', thumbnail: 't' });
  assert.equal(withImg.ocrText, '');
  assert.equal(withImg.hasImage, true);
  assert.equal(withImg.imageChanged, true);
  const removed = withoutImage(withImg);
  assert.equal(removed.hasImage, false);
  assert.equal(removed.image, null);
});

test('写真からの自動入力は空欄だけを埋める', () => {
  const draft = { ...emptyDraft('2026-01-01'), title: '自分で入力した公演名', hasStartTime: true, startTime: '19:00' };
  const parsed = {
    title: '読み取った公演名',
    venue: '読み取った会場',
    performanceDate: '2026-11-03',
    openTime: '17:00',
    startTime: '18:00',
    seat: { row: '5', number: '20' },
    price: 9800,
  };
  const { draft: next, filled } = fillEmptyFields(draft, parsed, { overwriteDate: true });
  assert.equal(next.title, '自分で入力した公演名');
  assert.equal(next.venue, '読み取った会場');
  assert.equal(next.startTime, '19:00');
  assert.equal(next.hasOpenTime, true);
  assert.equal(next.openTime, '17:00');
  assert.equal(next.performanceDate, '2026-11-03');
  assert.equal(next.priceText, '9800');
  assert.deepEqual(filled, ['公演日', '開場', '会場', '席', '価格']);
  // 元の下書きは変えない
  assert.equal(draft.venue, '');
});

test('overwriteDate でなければ公演日を変えない', () => {
  const { draft } = fillEmptyFields(emptyDraft('2025-05-05'), { performanceDate: '2026-11-03' });
  assert.equal(draft.performanceDate, '2025-05-05');
});

test('カテゴリーは未設定のときだけ自動入力する', () => {
  assert.equal(fillEmptyFields(emptyDraft(), { category: 'ライブ' }).draft.category, 'ライブ');
  assert.equal(fillEmptyFields({ ...emptyDraft(), category: '演劇' }, { category: 'ライブ' }).draft.category, '演劇');
});

test('AI の答えは入力済みの欄も上書きし、答えが空の項目は触らない', () => {
  const draft = { ...emptyDraft('2026-01-01'), title: 'OCRで読んだ崩れた公演名', venue: '自分で入力した会場', comment: 'コメント' };
  const { draft: next, filled } = overwriteFields(draft, { title: 'FLOGGING MOLLY', performanceDate: '2005-09-29', startTime: '19:00', venue: '' });
  assert.equal(next.title, 'FLOGGING MOLLY');
  assert.equal(next.venue, '自分で入力した会場');
  assert.equal(next.comment, 'コメント');
  assert.equal(next.performanceDate, '2005-09-29');
  assert.equal(next.hasStartTime, true);
  assert.equal(next.startTime, '19:00');
  assert.deepEqual(filled, ['公演名', '公演日', '開演']);
});

test('出演者は「、」でつないで入れる', () => {
  const { draft } = overwriteFields(emptyDraft(), { performerNames: ['A', 'B'] });
  assert.equal(draft.performerNames, 'A、B');
});

test('切り抜きの四隅は保存され、画像を外すと消える', () => {
  const crop = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
  const draft = withImage({ ...emptyDraft('2026-01-01'), title: 'a' }, { original: 'o', thumbnail: 't', source: 's' }, crop);
  const ticket = ticketFromDraft(draft, { id: 't', performerIds: [], now });
  assert.deepEqual(ticket.crop, crop);
  assert.deepEqual(draftFromTicket(ticket, new Map()).crop, crop);
  assert.equal(ticketFromDraft(withoutImage(draft), { id: 't', performerIds: [], now }).crop, null);
});

test('切り抜き直しでは読み取り文字を残す', () => {
  const draft = { ...emptyDraft(), hasImage: true, ocrText: '同じ写真の文字' };
  const next = withRecrop(draft, { original: 'o2', thumbnail: 't2', source: 's' }, null);
  assert.equal(next.ocrText, '同じ写真の文字');
  assert.equal(next.imageChanged, true);
});
