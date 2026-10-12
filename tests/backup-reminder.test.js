import { test } from 'node:test';
import assert from 'node:assert/strict';

import { backupIsStale } from '../src/model/backup-reminder.js';

const now = new Date('2026-10-12T00:00:00Z');

test('半券がなければ案内しない', () => assert.equal(backupIsStale(null, 0, now), false));
test('書き出したことがなく3枚以上なら案内する', () => {
  assert.equal(backupIsStale(null, 2, now), false);
  assert.equal(backupIsStale(null, 3, now), true);
});
test('最後の書き出しから30日を超えたら案内する', () => {
  assert.equal(backupIsStale('2026-09-20T00:00:00Z', 10, now), false);
  assert.equal(backupIsStale('2026-09-01T00:00:00Z', 10, now), true);
});
