import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, planImport, toBackupTicket, backupHeader, BACKUP_FORMAT } from '../../src/model/backup.js';

const performer = (id, name, aliases = []) => ({ id, name, reading: '', aliases });
const ticket = (id, fields = {}) => ({
  id, title: `公演${id}`, subtitle: '', category: '', performerIds: [], performanceDate: '2026-10-10',
  openTime: null, startTime: '18:00', venue: '', seat: { floor: '', block: '', row: '', number: '', gate: '', note: '' },
  price: null, issuer: '', ocrText: '', comment: '', crop: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  image: null, sourceImage: null, ...fields,
});
const backupOf = (tickets, performers) => ({ ...backupHeader(new Date('2026-10-12T00:00:00Z')), performers, tickets });

test('保存形式からバックアップの形へ（hasImage は入れず、画像を付ける）', () => {
  const t = toBackupTicket({ id: 'a', title: 'x', hasImage: true }, { image: 'BASE64' });
  assert.deepEqual(t, { id: 'a', title: 'x', image: 'BASE64', sourceImage: null });
});

test('正しいバックアップは通り、足りない項目は補う', () => {
  const data = backupOf([{ id: 't1', title: ' 公演 ', performanceDate: '2026-10-10', performerIds: ['p1'] }], [performer('p1', 'A')]);
  const { backup, errors } = validateBackup(data);
  assert.deepEqual(errors, []);
  const t = backup.tickets[0];
  assert.equal(t.title, '公演');
  assert.equal(t.openTime, null);
  assert.equal(t.price, null);
  assert.deepEqual(t.seat, { floor: '', block: '', row: '', number: '', gate: '', note: '' });
  assert.equal(t.image, null);
});

test('ほかのファイル・新しい版・壊れた半券は読み込まない', () => {
  assert.match(validateBackup({ foo: 1 }).errors[0], /このアプリのバックアップではありません/);
  assert.match(validateBackup(null).errors[0], /バックアップのファイルではありません/);
  assert.match(validateBackup({ format: BACKUP_FORMAT, version: 99, tickets: [], performers: [] }).errors[0], /新しい版/);
  const bad = backupOf([
    { id: 't1', title: '', performanceDate: '2026-10-10' },
    { id: 't2', title: '日付が変', performanceDate: '2026/10/10' },
    { id: 't3', title: '知らない出演者', performanceDate: '2026-10-10', performerIds: ['nobody'] },
  ], []);
  const { backup, errors } = validateBackup(bad);
  assert.equal(backup, null);
  assert.equal(errors.length, 3);
});

test('今のデータに足す：新しい半券は追加、同じ id は上書き', () => {
  const backup = validateBackup(backupOf([ticket('t1'), ticket('t2')], [])).backup;
  const plan = planImport(backup, { tickets: [{ id: 't1' }], performers: [] });
  assert.deepEqual([plan.summary.newTickets, plan.summary.overwritten], [1, 1]);
});

test('名前が一致する出演者は今の出演者にまとめ、名前・別名を別名に足す', () => {
  const existing = { tickets: [], performers: [performer('web-1', 'Mr.Children', ['ミスチル'])] };
  const backup = validateBackup(backupOf(
    [ticket('t1', { performerIds: ['ios-1'] }), ticket('t2', { performerIds: ['ios-2', 'ios-3'] })],
    [performer('ios-1', 'ｍｒ．ｃｈｉｌｄｒｅｎ', ['ミスターチルドレン']), performer('ios-2', 'ミスチル'), performer('ios-3', '新しい人')],
  )).backup;
  const plan = planImport(backup, existing);
  // ios-1（名前）と ios-2（別名）はどちらも web-1 にまとまる
  assert.deepEqual(plan.tickets.map((t) => t.performerIds), [['web-1'], ['web-1', 'ios-3']]);
  const merged = plan.performers.find((p) => p.id === 'web-1');
  assert.deepEqual(merged.aliases, ['ミスチル', 'ミスターチルドレン']);
  assert.deepEqual([plan.summary.newPerformers, plan.summary.matchedPerformers], [1, 2]);
});

test('同じ id の出演者は上書きする（自分の書き出しを読み直したとき）', () => {
  const existing = { tickets: [], performers: [performer('p1', '古い名前')] };
  const backup = validateBackup(backupOf([], [performer('p1', '新しい名前')])).backup;
  const plan = planImport(backup, existing);
  assert.deepEqual(plan.performers, [performer('p1', '新しい名前')]);
  assert.deepEqual([plan.summary.newPerformers, plan.summary.matchedPerformers], [0, 0]);
});

test('同じバックアップを2回読み込んでも増えない', () => {
  const backup = validateBackup(backupOf([ticket('t1', { performerIds: ['p1'] })], [performer('p1', 'A')])).backup;
  const first = planImport(backup, { tickets: [], performers: [] });
  const second = planImport(backup, { tickets: first.tickets, performers: first.performers });
  assert.deepEqual([second.summary.newTickets, second.summary.overwritten, second.summary.newPerformers], [0, 1, 0]);
});
