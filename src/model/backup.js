// バックアップの形式（画像込みの JSON 1ファイル）と、読み込みの計画。画像の変換（Base64）は backup-io.js が行う。
//
// {
//   format: 'ticket-collection-backup', version: 1, exportedAt: ISO, app: 'web' | 'ios',
//   performers: [{ id, name, reading, aliases: [] }],
//   tickets: [{ id, title, subtitle, category, performerIds: [], performanceDate: 'YYYY-MM-DD',
//               openTime: 'HH:MM' | null, startTime, venue, seat: { floor, block, row, number, gate, note },
//               price: number | null, issuer, ocrText, comment, crop: 四隅 | null, createdAt, updatedAt,
//               image: Base64 の JPEG | null（切り抜いた画像）, sourceImage: Base64 の JPEG | null（切り抜く前の写真） }]
// }
// iOS 版も同じ形式で書き出す（originalImage → sourceImage、processedImage → image）。

import { findPerformer } from './performers.js';
import { normalizeKey } from './text.js';
import { SEAT_FIELDS } from './ticket.js';

export const BACKUP_FORMAT = 'ticket-collection-backup';
export const BACKUP_VERSION = 1;

/** 保存形式の半券をバックアップの形に（画像は呼び出し側で Base64 にして渡す） */
export function toBackupTicket(ticket, { image = null, sourceImage = null } = {}) {
  const { hasImage: _ignored, ...rest } = ticket;
  return { ...rest, image, sourceImage };
}

export function backupHeader(now = new Date()) {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), app: 'web' };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const str = (v) => (typeof v === 'string' ? v : '');

/**
 * 読み込んだ JSON を確かめ、足りない項目を補った形にする。
 * @returns {{ backup: object | null, errors: string[] }} errors があれば読み込まない
 */
export function validateBackup(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return { backup: null, errors: ['バックアップのファイルではありません'] };
  if (data.format !== BACKUP_FORMAT) return { backup: null, errors: ['このアプリのバックアップではありません'] };
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    return { backup: null, errors: ['新しい版のアプリで作ったバックアップです。アプリを更新してから読み込んでください'] };
  }
  if (!Array.isArray(data.tickets) || !Array.isArray(data.performers)) {
    return { backup: null, errors: ['半券・出演者の一覧がありません'] };
  }

  const performers = [];
  const performerIds = new Set();
  data.performers.forEach((p, i) => {
    if (!p || typeof p.id !== 'string' || !str(p.name).trim()) {
      errors.push(`出演者 ${i + 1} 人目：id か名前がありません`);
      return;
    }
    performerIds.add(p.id);
    performers.push({ id: p.id, name: p.name.trim(), reading: str(p.reading), aliases: Array.isArray(p.aliases) ? p.aliases.filter((a) => typeof a === 'string') : [] });
  });

  const tickets = [];
  data.tickets.forEach((t, i) => {
    const where = `半券 ${i + 1} 枚目${t?.title ? `（${t.title}）` : ''}`;
    if (!t || typeof t.id !== 'string' || !str(t.title).trim()) {
      errors.push(`${where}：id か公演名がありません`);
      return;
    }
    if (!DATE.test(str(t.performanceDate))) {
      errors.push(`${where}：公演日の形が違います（${t.performanceDate}）`);
      return;
    }
    const missing = (t.performerIds ?? []).filter((id) => !performerIds.has(id));
    if (missing.length) {
      errors.push(`${where}：出演者の一覧にない出演者が紐づいています`);
      return;
    }
    tickets.push({
      id: t.id,
      title: t.title.trim(),
      subtitle: str(t.subtitle),
      category: str(t.category),
      performerIds: [...new Set(t.performerIds ?? [])],
      performanceDate: t.performanceDate,
      openTime: TIME.test(str(t.openTime)) ? t.openTime : null,
      startTime: TIME.test(str(t.startTime)) ? t.startTime : null,
      venue: str(t.venue),
      seat: Object.fromEntries(SEAT_FIELDS.map((k) => [k, str(t.seat?.[k])])),
      price: Number.isInteger(t.price) ? t.price : null,
      issuer: str(t.issuer),
      ocrText: str(t.ocrText),
      comment: str(t.comment),
      crop: validCrop(t.crop) ? t.crop : null,
      createdAt: str(t.createdAt) || new Date(0).toISOString(),
      updatedAt: str(t.updatedAt) || str(t.createdAt) || new Date(0).toISOString(),
      image: typeof t.image === 'string' && t.image ? t.image : null,
      sourceImage: typeof t.sourceImage === 'string' && t.sourceImage ? t.sourceImage : null,
    });
  });

  return { backup: errors.length ? null : { ...data, performers, tickets }, errors };
}

const validCrop = (crop) => Array.isArray(crop) && crop.length === 4
  && crop.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));

/**
 * 読み込みの計画：今のデータに足すとどうなるか。
 * - 出演者：同じ id は上書き。id が違っても名前・別名が一致すれば同じ人として今の出演者にまとめる（別名は足す）
 * - 半券：同じ id は上書き、なければ追加
 * @returns {{ performers: object[], tickets: object[], summary: object }}
 *   performers は書き込む出演者、tickets は出演者の id を付け替えた半券（画像の Base64 つき）
 */
export function planImport(backup, existing) {
  const idMap = new Map();
  const result = new Map();
  const known = [...existing.performers];
  let added = 0;
  let matched = 0;

  for (const p of backup.performers) {
    const sameId = known.find((k) => k.id === p.id);
    const sameName = sameId ? null : findPerformer(known, p.name) ?? p.aliases.map((a) => findPerformer(known, a)).find(Boolean);
    if (sameName) {
      // 名前で一致：今の出演者にまとめ、読み込んだ側の名前・別名を別名に足す
      const target = result.get(sameName.id) ?? sameName;
      const aliases = [...target.aliases];
      for (const n of [p.name, ...p.aliases]) {
        if (normalizeKey(n) !== normalizeKey(target.name) && !aliases.some((a) => normalizeKey(a) === normalizeKey(n))) aliases.push(n);
      }
      const merged = { ...target, aliases, reading: target.reading || p.reading };
      result.set(target.id, merged);
      idMap.set(p.id, target.id);
      matched++;
    } else {
      result.set(p.id, p);
      idMap.set(p.id, p.id);
      if (!sameId) {
        known.push(p);
        added++;
      }
    }
  }

  const existingIds = new Set(existing.tickets.map((t) => t.id));
  const tickets = backup.tickets.map((t) => ({ ...t, performerIds: [...new Set(t.performerIds.map((id) => idMap.get(id)))] }));
  const overwritten = tickets.filter((t) => existingIds.has(t.id)).length;

  return {
    performers: [...result.values()],
    tickets,
    summary: {
      tickets: tickets.length,
      newTickets: tickets.length - overwritten,
      overwritten,
      withImage: tickets.filter((t) => t.image).length,
      newPerformers: added,
      matchedPerformers: matched,
    },
  };
}
