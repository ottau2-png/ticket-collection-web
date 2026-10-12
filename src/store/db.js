// 半券・出演者・画像の保存（IndexedDB）。
// 書き込みは1回のトランザクションで行い、書き終わる（complete）まで待ってから返す。
// 出演者の付け替えのたびに、どの半券にも紐づかなくなった出演者を同じトランザクションで消す。

import { openDatabase, requestResult, transactionDone } from './idb.js';
import { orphanPerformerIds, mergePerformer } from '../model/performers.js';

const DB_NAME = 'ticket-collection';
const DB_VERSION = 1;

// ストア：tickets・performers（keyPath id）、originals・thumbnails（半券の id をキーに Blob）、meta（設定など）
const ALL_STORES = ['tickets', 'performers', 'originals', 'thumbnails', 'meta'];

export function openTicketDatabase(name = DB_NAME) {
  return openDatabase(name, DB_VERSION, (db, oldVersion) => {
    if (oldVersion < 1) {
      db.createObjectStore('tickets', { keyPath: 'id' });
      db.createObjectStore('performers', { keyPath: 'id' });
      db.createObjectStore('originals');
      db.createObjectStore('thumbnails');
      db.createObjectStore('meta');
    }
  });
}

export class TicketStore {
  constructor(db) {
    this.db = db;
  }

  static async open(name) {
    return new TicketStore(await openTicketDatabase(name));
  }

  /** 一覧用：半券と出演者をすべて（画像は読まない） */
  async loadAll() {
    const tx = this.db.transaction(['tickets', 'performers']);
    const [tickets, performers] = await Promise.all([
      requestResult(tx.objectStore('tickets').getAll()),
      requestResult(tx.objectStore('performers').getAll()),
    ]);
    return { tickets, performers };
  }

  getThumbnail(ticketId) {
    return this.#get('thumbnails', ticketId);
  }

  getOriginal(ticketId) {
    return this.#get('originals', ticketId);
  }

  async getMeta(key) {
    return this.#get('meta', key);
  }

  async setMeta(key, value) {
    const tx = this.db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(value, key);
    await transactionDone(tx);
  }

  /**
   * 半券を保存する。
   * @param ticket 保存形式の半券
   * @param newPerformers 出演者欄から新しく作った出演者
   * @param image { original, thumbnail } で差し替え、null で削除、undefined なら画像を触らない
   */
  async saveTicket(ticket, { newPerformers = [], image } = {}) {
    await this.#write(async (tx) => {
      for (const p of newPerformers) tx.objectStore('performers').put(p);
      tx.objectStore('tickets').put(ticket);
      if (image === null) {
        tx.objectStore('originals').delete(ticket.id);
        tx.objectStore('thumbnails').delete(ticket.id);
      } else if (image) {
        tx.objectStore('originals').put(image.original, ticket.id);
        tx.objectStore('thumbnails').put(image.thumbnail, ticket.id);
      }
      await removeOrphans(tx);
    });
  }

  async deleteTicket(ticketId) {
    await this.#write(async (tx) => {
      tx.objectStore('tickets').delete(ticketId);
      tx.objectStore('originals').delete(ticketId);
      tx.objectStore('thumbnails').delete(ticketId);
      await removeOrphans(tx);
    });
  }

  /** 出演者の名前・よみ・別名を変える */
  async savePerformer(performer) {
    await this.#write(async (tx) => {
      tx.objectStore('performers').put(performer);
    });
  }

  /** source を target に統合する（半券の付け替え・別名の引き継ぎ・source の削除） */
  async mergePerformers(sourceId, targetId) {
    await this.#write(async (tx) => {
      const performers = tx.objectStore('performers');
      const [source, target, tickets] = await Promise.all([
        requestResult(performers.get(sourceId)),
        requestResult(performers.get(targetId)),
        requestResult(tx.objectStore('tickets').getAll()),
      ]);
      if (!source || !target) throw new Error('統合する出演者が見つかりません');
      const result = mergePerformer(source, target, tickets);
      performers.put(result.target);
      for (const t of result.tickets) tx.objectStore('tickets').put(t);
      if (sourceId !== targetId) performers.delete(sourceId);
    });
  }

  /** トランザクションの中で fn を実行し、書き終わるまで待つ。fn が失敗したら取り消す */
  async #write(fn) {
    const tx = this.db.transaction(ALL_STORES, 'readwrite');
    const done = transactionDone(tx);
    try {
      await fn(tx);
    } catch (e) {
      try { tx.abort(); } catch { /* もう終わっている */ }
      await done.catch(() => {});
      throw e;
    }
    await done;
  }

  async #get(store, key) {
    return requestResult(this.db.transaction(store).objectStore(store).get(key));
  }
}

/** どの半券にも紐づかない出演者を消す（同じトランザクションの書き込みを反映した状態で判定する） */
async function removeOrphans(tx) {
  const [tickets, performers] = await Promise.all([
    requestResult(tx.objectStore('tickets').getAll()),
    requestResult(tx.objectStore('performers').getAll()),
  ]);
  for (const id of orphanPerformerIds(performers, tickets)) tx.objectStore('performers').delete(id);
}
