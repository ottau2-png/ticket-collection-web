// 半券の保存形式と、編集フォーム用の下書き。
//
// 保存形式（IndexedDB の tickets）:
//   { id, title, subtitle, category, performerIds: [], performanceDate: 'YYYY-MM-DD',
//     openTime: 'HH:MM' | null, startTime: 'HH:MM' | null, venue,
//     seat: { floor, block, row, number, gate, note }, price: number | null, issuer,
//     ocrText, comment, hasImage: boolean, createdAt: ISO, updatedAt: ISO }
// 画像は別のストア（originals / thumbnails）に半券の id で置く。一覧はサムネイルだけ読む。
//
// フォームは下書きを編集し、保存時だけ ticketFromDraft で保存形式にする（キャンセルで何も変えないため）。

import { parsePrice } from './text.js';
import { performerNamesOf } from './performers.js';

export const SEAT_FIELDS = ['floor', 'block', 'row', 'number', 'gate', 'note'];
export const SEAT_LABELS = { floor: '階', block: 'ブロック', row: '列', number: '番号', gate: 'ゲート・扉', note: 'その他' };

/** 時刻欄をオンにしたときの初期値（夕方の公演が多いため 17:00 開場・18:00 開演） */
export const DEFAULT_OPEN_TIME = '17:00';
export const DEFAULT_START_TIME = '18:00';

/** 端末の時刻での 'YYYY-MM-DD' */
export function localDateString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const emptySeat = () => Object.fromEntries(SEAT_FIELDS.map((k) => [k, '']));

export function emptyDraft(today = localDateString()) {
  return {
    title: '',
    category: '',
    subtitle: '',
    performerNames: '',
    performanceDate: today,
    hasOpenTime: false,
    openTime: DEFAULT_OPEN_TIME,
    hasStartTime: false,
    startTime: DEFAULT_START_TIME,
    venue: '',
    seat: emptySeat(),
    priceText: '',
    issuer: '',
    comment: '',
    ocrText: '',
    // 画像は { original: Blob, thumbnail: Blob } か null。imageChanged が false なら保存時に画像を触らない
    image: null,
    hasImage: false,
    imageChanged: false,
  };
}

export function draftFromTicket(ticket, performersById) {
  return {
    ...emptyDraft(ticket.performanceDate),
    title: ticket.title,
    category: ticket.category,
    subtitle: ticket.subtitle,
    performerNames: performerNamesOf(ticket, performersById).join('、'),
    hasOpenTime: ticket.openTime != null,
    openTime: ticket.openTime ?? DEFAULT_OPEN_TIME,
    hasStartTime: ticket.startTime != null,
    startTime: ticket.startTime ?? DEFAULT_START_TIME,
    venue: ticket.venue,
    seat: { ...emptySeat(), ...ticket.seat },
    priceText: ticket.price == null ? '' : String(ticket.price),
    issuer: ticket.issuer,
    comment: ticket.comment,
    ocrText: ticket.ocrText,
    hasImage: ticket.hasImage,
  };
}

export function canSave(draft) {
  return draft.title.trim() !== '';
}

/** 新しい画像を付ける。前の画像の読み取り文字は消す */
export function withImage(draft, image) {
  return { ...draft, image, hasImage: true, imageChanged: true, ocrText: '' };
}

export function withoutImage(draft) {
  return { ...draft, image: null, hasImage: false, imageChanged: true, ocrText: '' };
}

/**
 * 下書きを保存形式にする。
 * @param existing 編集なら元の半券、新規なら null
 */
export function ticketFromDraft(draft, { id, performerIds, existing = null, now = new Date() }) {
  const iso = now.toISOString();
  return {
    id,
    title: draft.title.trim(),
    subtitle: draft.subtitle,
    category: draft.category,
    performerIds,
    performanceDate: draft.performanceDate,
    openTime: draft.hasOpenTime ? draft.openTime : null,
    startTime: draft.hasStartTime ? draft.startTime : null,
    venue: draft.venue,
    seat: { ...draft.seat },
    price: parsePrice(draft.priceText),
    issuer: draft.issuer,
    ocrText: draft.ocrText,
    comment: draft.comment,
    hasImage: draft.hasImage,
    createdAt: existing?.createdAt ?? iso,
    updatedAt: iso,
  };
}

// ---- 読み取り結果の反映 ----
// parsed: { title, category, subtitle, performerNames: [], performanceDate: 'YYYY-MM-DD', openTime: 'HH:MM',
//           startTime, venue, seat: { floor, ... }, price: number, issuer }（どれも省略可）

/** 写真の読み取り結果で空欄だけを埋める。公演日は空欄を判別できないので overwriteDate のときだけ */
export function fillEmptyFields(draft, parsed, { overwriteDate = false } = {}) {
  return applyParsed(draft, parsed, { onlyEmpty: true, includeDate: overwriteDate });
}

/** AI の答えのような確かな結果で、入力済みの欄も上書きする。答えが空の項目は触らない */
export function overwriteFields(draft, parsed) {
  return applyParsed(draft, parsed, { onlyEmpty: false, includeDate: true });
}

/** @returns {{ draft: object, filled: string[] }} filled は反映した項目名（表示用） */
function applyParsed(draft, parsed, { onlyEmpty, includeDate }) {
  const next = { ...draft, seat: { ...draft.seat } };
  const filled = [];
  const mark = (label) => {
    if (!filled.includes(label)) filled.push(label);
  };
  const fill = (get, set, value, label) => {
    if (value == null || value === '') return;
    if (onlyEmpty && String(get()).trim() !== '') return;
    set(value);
    mark(label);
  };

  fill(() => next.title, (v) => (next.title = v), parsed.title, '公演名');
  fill(() => next.category, (v) => (next.category = v), parsed.category, 'カテゴリー');
  fill(() => next.subtitle, (v) => (next.subtitle = v), parsed.subtitle, 'ツアー名');
  fill(() => next.performerNames, (v) => (next.performerNames = v), parsed.performerNames?.length ? parsed.performerNames.join('、') : null, '出演者');
  if (includeDate && parsed.performanceDate) {
    next.performanceDate = parsed.performanceDate;
    mark('公演日');
  }
  if (parsed.openTime && !(onlyEmpty && next.hasOpenTime)) {
    next.hasOpenTime = true;
    next.openTime = parsed.openTime;
    mark('開場');
  }
  if (parsed.startTime && !(onlyEmpty && next.hasStartTime)) {
    next.hasStartTime = true;
    next.startTime = parsed.startTime;
    mark('開演');
  }
  fill(() => next.venue, (v) => (next.venue = v), parsed.venue, '会場');
  for (const key of SEAT_FIELDS) {
    fill(() => next.seat[key], (v) => (next.seat[key] = v), parsed.seat?.[key], '席');
  }
  fill(() => next.priceText, (v) => (next.priceText = v), parsed.price == null ? null : String(parsed.price), '価格');
  fill(() => next.issuer, (v) => (next.issuer = v), parsed.issuer, '発券元');
  return { draft: next, filled };
}
