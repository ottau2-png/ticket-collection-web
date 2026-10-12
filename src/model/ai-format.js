// AI アプリ（Claude など）に半券を読み取ってもらうための指示文と、その答えの読み取り。
// アプリから AI の API は呼ばない（従量課金を使わない方針）。ユーザーが自分の AI アプリで読み取り、答えを貼り付ける。

import { CATEGORIES, categoryFromAnswer } from './category.js';
import { splitNames } from './text.js';

export const FIELD_LABELS = [
  '公演名', 'カテゴリー', 'ツアー名', '出演者', '公演日', '開場', '開演', '会場',
  '階', 'ブロック', '列', '番号', 'ゲート・扉', '席その他', '価格', '発券元',
];

export const AI_PROMPT = `この写真はコンサートや舞台のチケット半券です。半券に書かれている内容を読み取り、下の形式だけで出力してください。
・項目名は変えずに、1行に1項目
・分からない項目は「:」の後ろを空欄にする
・公演日は YYYY-MM-DD、開場・開演は24時間表記の HH:MM
・価格は数字だけ（ドリンク代などの別料金は含めない）
・カテゴリーは次から1つ選ぶ：${CATEGORIES.join('、')}
・出演者が複数なら「、」で区切る
・整理番号は「席その他」に「整理番号 A123」のように書く
・氏名、電話番号、チケット番号、URL は出力しない
・前置きや説明は書かない

${FIELD_LABELS.map((l) => `${l}:`).join('\n')}`;

const EMPTY_VALUES = ['不明', 'なし', '-', 'ー'];

/** 全角英数字・記号を半角に、全角スペースを半角に、「￥」を「¥」に（カタカナは全角のまま） */
export function normalizeWidth(text) {
  return String(text ?? '')
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .replace(/￥/g, '¥')
    .trim();
}

const pad2 = (n) => String(n).padStart(2, '0');

function validDate(year, month, day) {
  if (!(year >= 1950 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** 文字列中の日付を 'YYYY-MM-DD' に。「2026年10月10日」「令和8年1月15日」「2026/10/10」「2026.10.10」「2005 9 29」 */
export function parseDate(text) {
  const s = normalizeWidth(text);
  let m = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/(令和|平成)\s*(\d{1,2}|元)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m) {
    const eraYear = m[2] === '元' ? 1 : +m[2];
    return validDate((m[1] === '令和' ? 2018 : 1988) + eraYear, +m[3], +m[4]);
  }
  m = s.match(/(?:^|\D)(\d{4})\s*(?:[/.-]|\s)\s*(\d{1,2})\s*(?:[/.-]|\s)\s*(\d{1,2})(?!\d)/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  return null;
}

/** 文字列中の最初の時刻を 'HH:MM'（24時間）に。「18:00」「18時30分」「6:30 PM」「午後6時30分」 */
export function parseTime(text) {
  const s = normalizeWidth(text);
  const re = /(?:^|\D)(午前|午後)?\s*(\d{1,2})\s*[:時]\s*(\d{2})(?!\d)\s*(am|pm)?/gi;
  for (const m of s.matchAll(re)) {
    let hour = +m[2];
    const minute = +m[3];
    const half = m[4]?.toLowerCase();
    if ((m[1] === '午後' || half === 'pm') && hour < 12) hour += 12;
    if ((m[1] === '午前' || half === 'am') && hour === 12) hour = 0;
    if (hour <= 23 && minute <= 59) return `${pad2(hour)}:${pad2(minute)}`;
  }
  // 「18時」のように分がない書き方
  const hourOnly = s.match(/(?:^|\D)(午前|午後)?\s*(\d{1,2})\s*時(?!\s*\d)/);
  if (hourOnly) {
    let hour = +hourOnly[2];
    if (hourOnly[1] === '午後' && hour < 12) hour += 12;
    if (hour <= 23) return `${pad2(hour)}:00`;
  }
  return null;
}

/**
 * AI の答えから項目を取り出す。決まった項目名の行が1つもなければ null。
 * 前置きの文章・コードブロック・箇条書き・太字・全角コロンなどの崩れは許容する。
 * @returns {{ parsed: object, values: [label, value][] }} values は読み取れた項目（確認の表示用、指示文の順）
 */
export function parseAIAnswer(text) {
  const values = new Map();
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = normalizeWidth(raw).replaceAll('**', '').replace(/^[-*•・\s]+|[-*•・\s]+$/g, '');
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const label = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!FIELD_LABELS.includes(label) || !value || EMPTY_VALUES.includes(value)) continue;
    values.set(label, value);
  }
  if (values.size === 0) return null;

  const get = (label) => values.get(label) ?? null;
  const priceDigits = get('価格')?.replace(/[^0-9]/g, '');
  const parsed = {
    title: get('公演名'),
    category: get('カテゴリー') && categoryFromAnswer(get('カテゴリー')),
    subtitle: get('ツアー名'),
    performerNames: get('出演者') ? splitNames(get('出演者')) : [],
    performanceDate: get('公演日') && parseDate(get('公演日')),
    openTime: get('開場') && parseTime(get('開場')),
    startTime: get('開演') && parseTime(get('開演')),
    venue: get('会場'),
    seat: {
      floor: get('階'),
      block: get('ブロック'),
      row: get('列'),
      number: get('番号'),
      gate: get('ゲート・扉'),
      note: get('席その他'),
    },
    price: priceDigits ? Number.parseInt(priceDigits, 10) : null,
    issuer: get('発券元'),
  };
  const ordered = FIELD_LABELS.filter((l) => values.has(l)).map((l) => [l, values.get(l)]);
  return { parsed, values: ordered };
}
