// 一覧の並び替え・グループ分け・検索。

import { CATEGORIES } from './category.js';
import { comparePerformers } from './performers.js';
import { normalizeKey, compareText } from './text.js';

export const LIST_MODES = [
  { id: 'newest', label: '公演日（新しい順）' },
  { id: 'oldest', label: '公演日（古い順）' },
  { id: 'byYear', label: '年ごと' },
  { id: 'byPerformer', label: '出演者ごと' },
  { id: 'byCategory', label: 'カテゴリーごと' },
];

/** 公演日の新しい順。同じ日は開演の遅い順、それも同じなら登録の新しい順 */
function newestFirst(tickets) {
  return [...tickets].sort((a, b) =>
    compareDesc(a.performanceDate, b.performanceDate)
    || compareDesc(a.startTime ?? '', b.startTime ?? '')
    || compareDesc(a.createdAt, b.createdAt));
}

const compareDesc = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

/**
 * @returns {{ id: string, title: string | null, tickets: object[] }[]} title が null なら見出しなし
 */
export function groupTickets(tickets, mode, performersById) {
  const sorted = newestFirst(tickets);
  switch (mode) {
    case 'oldest':
      return [{ id: 'all', title: null, tickets: sorted.reverse() }];
    case 'byYear':
      return yearSections(sorted);
    case 'byPerformer':
      return performerSections(sorted, performersById);
    case 'byCategory':
      return categorySections(sorted);
    default:
      return [{ id: 'all', title: null, tickets: sorted }];
  }
}

function yearSections(tickets) {
  const byYear = new Map();
  for (const t of tickets) {
    const year = t.performanceDate.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(t);
  }
  // 新しい順に並べた半券から作るので、Map の順がそのまま新しい年から
  return [...byYear].map(([year, items]) => ({ id: `year-${year}`, title: `${Number(year)}年（${items.length}）`, tickets: items }));
}

/** 出演者が複数の半券は、それぞれの出演者の下に出す。出演者なしは最後 */
function performerSections(tickets, performersById) {
  const byPerformer = new Map();
  const without = [];
  for (const t of tickets) {
    const performers = t.performerIds.map((id) => performersById.get(id)).filter(Boolean);
    if (performers.length === 0) without.push(t);
    for (const p of performers) {
      if (!byPerformer.has(p.id)) byPerformer.set(p.id, { performer: p, items: [] });
      byPerformer.get(p.id).items.push(t);
    }
  }
  const sections = [...byPerformer.values()]
    .sort((a, b) => comparePerformers(a.performer, b.performer))
    .map(({ performer, items }) => ({ id: `performer-${performer.id}`, title: `${performer.name}（${items.length}）`, tickets: items }));
  if (without.length) sections.push({ id: 'no-performer', title: `出演者なし（${without.length}）`, tickets: without });
  return sections;
}

/** 選択肢の順に並べ、選択肢にない値は名前順でその後、未設定は最後 */
function categorySections(tickets) {
  const byCategory = new Map();
  for (const t of tickets) {
    if (!byCategory.has(t.category)) byCategory.set(t.category, []);
    byCategory.get(t.category).push(t);
  }
  const unknown = [...byCategory.keys()].filter((c) => c && !CATEGORIES.includes(c)).sort(compareText);
  return [...CATEGORIES, ...unknown, '']
    .filter((c) => byCategory.has(c))
    .map((c) => {
      const name = c || '未設定';
      const items = byCategory.get(c);
      return { id: `category-${name}`, title: `${name}（${items.length}）`, tickets: items };
    });
}

/** 全画面でめくって見る半券。並び順のまま、画像のあるものだけを1回ずつ */
export function viewableTickets(sections) {
  const seen = new Set();
  return sections.flatMap((s) => s.tickets).filter((t) => {
    if (!t.hasImage || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

/** 公演名・ツアー名・カテゴリー・会場・出演者名（別名を含む）・コメントから探す。大文字小文字・全角半角は区別しない */
export function filterTickets(tickets, query, performersById) {
  const key = normalizeKey(query);
  if (!key) return tickets;
  return tickets.filter((t) => {
    const performerNames = t.performerIds.flatMap((id) => {
      const p = performersById.get(id);
      return p ? [p.name, ...p.aliases] : [];
    });
    const fields = [t.title, t.subtitle, t.category, t.venue, t.comment, ...performerNames];
    return fields.some((f) => normalizeKey(f).includes(key));
  });
}
