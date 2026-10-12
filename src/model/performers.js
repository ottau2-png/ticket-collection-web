// 出演者の照合・統合・整理。データを直接書き換えず、変更後の値を返す（保存は store/db.js が行う）。
// 出演者: { id, name, reading, aliases: [] }

import { normalizeKey, splitNames, compareText } from './text.js';

/** 並び替えのキー。よみがあればよみ、なければ名前 */
export function performerSortKey(p) {
  return p.reading ? p.reading : p.name;
}

export function comparePerformers(a, b) {
  return compareText(performerSortKey(a), performerSortKey(b));
}

/** 名前・別名が一致する出演者（大文字小文字・全角半角を無視） */
export function findPerformer(performers, name) {
  const key = normalizeKey(name);
  if (!key) return null;
  return performers.find((p) => normalizeKey(p.name) === key || p.aliases.some((a) => normalizeKey(a) === key)) ?? null;
}

/**
 * 出演者欄のテキストを出演者に解決する。見つからない名前は新しく作る。
 * @returns {{ ids: string[], created: object[] }} ids は入力順・重複なし
 */
export function resolvePerformers(text, existing, makeId = () => crypto.randomUUID()) {
  const known = [...existing];
  const ids = [];
  const created = [];
  for (const name of splitNames(text)) {
    let performer = findPerformer(known, name);
    if (!performer) {
      performer = { id: makeId(), name, reading: '', aliases: [] };
      known.push(performer);
      created.push(performer);
    }
    if (!ids.includes(performer.id)) ids.push(performer.id);
  }
  return { ids, created };
}

/** 半券の出演者名（名前順）。編集欄に「、」区切りで出す */
export function performerNamesOf(ticket, performersById) {
  return ticket.performerIds
    .map((id) => performersById.get(id)?.name)
    .filter(Boolean)
    .sort(compareText);
}

/**
 * source を target に統合する。source の半券を target に付け替え、source の名前・別名を target の別名に加える。
 * @returns {{ target: object, tickets: object[] }} 書き換えた target と、付け替えた半券だけ
 */
export function mergePerformer(source, target, tickets) {
  if (source.id === target.id) return { target, tickets: [] };

  const aliases = [...target.aliases];
  const targetKey = normalizeKey(target.name);
  for (const name of [source.name, ...source.aliases]) {
    const key = normalizeKey(name);
    if (key !== targetKey && !aliases.some((a) => normalizeKey(a) === key)) aliases.push(name);
  }

  const changed = tickets
    .filter((t) => t.performerIds.includes(source.id))
    .map((t) => {
      const ids = t.performerIds.filter((id) => id !== source.id);
      if (!ids.includes(target.id)) ids.push(target.id);
      return { ...t, performerIds: ids };
    });

  return { target: { ...target, aliases }, tickets: changed };
}

/** どの半券にも紐づかない出演者の id */
export function orphanPerformerIds(performers, tickets) {
  const used = new Set(tickets.flatMap((t) => t.performerIds));
  return performers.filter((p) => !used.has(p.id)).map((p) => p.id);
}

/** 別名欄のテキスト（区切りは出演者欄と同じ）を配列に。名前と同じものは除く */
export function parseAliases(text, name) {
  const nameKey = normalizeKey(name);
  return splitNames(text).filter((a) => normalizeKey(a) !== nameKey);
}
