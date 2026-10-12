// 表示用の整形。

const CATEGORY_ICONS = {
  ライブ: '🎤',
  演劇: '🎭',
  ミュージカル: '🎶',
  クラシック: '🎻',
  お笑い: '😄',
  スポーツ: '🏟️',
  展示会: '🖼️',
  映画: '🎬',
  その他: '🎫',
};

/** 画像のない半券に出すカテゴリーのアイコン */
export function categoryIcon(category) {
  return CATEGORY_ICONS[category] ?? '🎫';
}

/** '2026-10-10' → '2026/10/10' */
export function formatDate(date) {
  return date ? date.replaceAll('-', '/') : '';
}

/** 一覧の1行：「カテゴリー 日付 会場」 */
export function ticketMetaLine(ticket) {
  return [ticket.category, formatDate(ticket.performanceDate), ticket.venue].filter(Boolean).join(' ');
}

export function formatPrice(price) {
  return price == null ? '' : `${price.toLocaleString('ja-JP')}円`;
}
