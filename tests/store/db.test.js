import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TicketStore } from '../../src/store/db.js';
import { emptyDraft, ticketFromDraft } from '../../src/model/ticket.js';
import { resolvePerformers } from '../../src/model/performers.js';

let dbCount = 0;
const openStore = () => TicketStore.open(`test-${++dbCount}`);
const now = new Date('2026-10-12T00:00:00Z');

/** フォームから保存するときと同じ手順で半券を作る */
async function saveFromForm(store, id, fields, options = {}) {
  const { performers } = await store.loadAll();
  const draft = { ...emptyDraft('2026-10-10'), ...fields };
  const { ids, created } = resolvePerformers(draft.performerNames, performers);
  const ticket = ticketFromDraft(draft, { id, performerIds: ids, now });
  await store.saveTicket(ticket, { newPerformers: created, ...options });
  return ticket;
}

const names = (performers) => performers.map((p) => p.name).sort();

test('保存した半券・出演者・画像を読み直せる', async () => {
  const store = await openStore();
  const image = { original: new Blob(['original']), thumbnail: new Blob(['thumb']) };
  await saveFromForm(store, 't1', { title: '公演', performerNames: 'A、B', hasImage: true }, { image });

  const { tickets, performers } = await store.loadAll();
  assert.deepEqual(tickets.map((t) => t.title), ['公演']);
  assert.deepEqual(names(performers), ['A', 'B']);
  assert.equal(await (await store.getOriginal('t1')).text(), 'original');
  assert.equal(await (await store.getThumbnail('t1')).text(), 'thumb');
});

test('既存の出演者は名前・別名で再利用され、増えない', async () => {
  const store = await openStore();
  await saveFromForm(store, 't1', { title: '1', performerNames: 'Mr.Children' });
  await saveFromForm(store, 't2', { title: '2', performerNames: 'ｍｒ．ｃｈｉｌｄｒｅｎ' });
  const { tickets, performers } = await store.loadAll();
  assert.equal(performers.length, 1);
  assert.deepEqual(tickets[0].performerIds, tickets[1].performerIds);
});

test('image を省くと画像を残し、null なら消す', async () => {
  const store = await openStore();
  const image = { original: new Blob(['o']), thumbnail: new Blob(['t']) };
  await saveFromForm(store, 't1', { title: '公演', hasImage: true }, { image });
  await saveFromForm(store, 't1', { title: '公演（直した）', hasImage: true });
  assert.ok(await store.getOriginal('t1'));
  await saveFromForm(store, 't1', { title: '公演', hasImage: false }, { image: null });
  assert.equal(await store.getOriginal('t1'), undefined);
  assert.equal(await store.getThumbnail('t1'), undefined);
});

test('出演者を外して保存すると、どの半券にもいない出演者は消える', async () => {
  const store = await openStore();
  await saveFromForm(store, 't1', { title: '公演', performerNames: '残る、消える' });
  await saveFromForm(store, 't1', { title: '公演', performerNames: '残る' });
  assert.deepEqual(names((await store.loadAll()).performers), ['残る']);
});

test('最後の半券を消すと、その出演者と画像も消える', async () => {
  const store = await openStore();
  const image = { original: new Blob(['o']), thumbnail: new Blob(['t']) };
  await saveFromForm(store, 't1', { title: '公演', performerNames: '出演者', hasImage: true }, { image });
  await saveFromForm(store, 't2', { title: '別の公演', performerNames: '別の人' });
  await store.deleteTicket('t1');
  const { tickets, performers } = await store.loadAll();
  assert.deepEqual(tickets.map((t) => t.id), ['t2']);
  assert.deepEqual(names(performers), ['別の人']);
  assert.equal(await store.getOriginal('t1'), undefined);
});

test('統合：半券を付け替え、別名を引き継いで元の出演者を消す', async () => {
  const store = await openStore();
  await saveFromForm(store, 't1', { title: '1', performerNames: 'Mr.Children' });
  await saveFromForm(store, 't2', { title: '2', performerNames: 'ミスターチルドレン' });
  await saveFromForm(store, 't3', { title: '3', performerNames: 'Mr.Children、ミスターチルドレン' });
  const before = await store.loadAll();
  const target = before.performers.find((p) => p.name === 'Mr.Children');
  const source = before.performers.find((p) => p.name === 'ミスターチルドレン');

  await store.mergePerformers(source.id, target.id);

  const { tickets, performers } = await store.loadAll();
  assert.deepEqual(performers.map((p) => [p.name, p.aliases]), [['Mr.Children', ['ミスターチルドレン']]]);
  for (const t of tickets) assert.deepEqual(t.performerIds, [target.id], t.title);
});

test('統合の途中で失敗したら何も変えない', async () => {
  const store = await openStore();
  await saveFromForm(store, 't1', { title: '1', performerNames: 'A' });
  const before = await store.loadAll();
  await assert.rejects(store.mergePerformers(before.performers[0].id, 'missing'));
  assert.deepEqual(await store.loadAll(), before);
});

test('設定の値を保存できる', async () => {
  const store = await openStore();
  assert.equal(await store.getMeta('lastExportAt'), undefined);
  await store.setMeta('lastExportAt', '2026-10-12T00:00:00Z');
  assert.equal(await store.getMeta('lastExportAt'), '2026-10-12T00:00:00Z');
});

test('切り抜く前の写真も保存・削除される。source なしの画像に差し替えると消える', async () => {
  const store = await openStore();
  const image = { original: new Blob(['o']), thumbnail: new Blob(['t']), source: new Blob(['s']) };
  await saveFromForm(store, 't1', { title: '公演', hasImage: true }, { image });
  assert.equal(await (await store.getSource('t1')).text(), 's');
  await saveFromForm(store, 't1', { title: '公演', hasImage: true }, { image: { original: new Blob(['o2']), thumbnail: new Blob(['t2']) } });
  assert.equal(await store.getSource('t1'), undefined);
  await saveFromForm(store, 't2', { title: '別', hasImage: true }, { image });
  await store.deleteTicket('t2');
  assert.equal(await store.getSource('t2'), undefined);
});

test('版1のデータベースから開き直しても、半券は残り sources が増える', async () => {
  const name = `upgrade-${Date.now()}`;
  const v1 = await new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      for (const s of ['tickets', 'performers']) req.result.createObjectStore(s, { keyPath: 'id' });
      for (const s of ['originals', 'thumbnails', 'meta']) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve) => {
    const tx = v1.transaction('tickets', 'readwrite');
    tx.objectStore('tickets').put({ id: 'old', title: '古い半券', performerIds: [] });
    tx.oncomplete = resolve;
  });
  v1.close();
  const store = await TicketStore.open(name);
  assert.deepEqual((await store.loadAll()).tickets.map((t) => t.title), ['古い半券']);
  assert.ok(store.db.objectStoreNames.contains('sources'));
  assert.equal(await store.getSource('old'), undefined);
});
