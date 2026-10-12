// 半券のカテゴリー。半券には表示名を文字列で保存する（選択肢を増やしても既存データを壊さないため）。

export const CATEGORIES = ['ライブ', '演劇', 'ミュージカル', 'クラシック', 'お笑い', 'スポーツ', '展示会', '映画', 'その他'];

// 推測に使う語。上から順に調べるので、より限定的なカテゴリーを先に置く（「ミュージカル LIVE」はミュージカル）
const CLUES = [
  ['ミュージカル', ['ミュージカル', 'musical']],
  ['クラシック', ['交響楽団', 'オーケストラ', 'フィルハーモニー', '管弦楽', 'リサイタル', '演奏会', 'クラシック', 'orchestra', 'symphony']],
  ['お笑い', ['寄席', '落語', '漫才', 'お笑い', 'コント']],
  ['スポーツ', [' vs ', ' vs.', '試合', '選手権', 'スポーツ']],
  ['展示会', ['展覧会', '展示', '美術展', '博覧会', '美術館', '博物館', 'エキシビション', 'exhibition']],
  ['演劇', ['劇団', '演劇', '舞台', '芝居', '歌舞伎', '文楽', '狂言']],
  ['映画', ['映画', '上映', 'シネマ', 'cinema']],
  ['ライブ', ['live', 'tour', 'ライブ', 'コンサート', 'concert', 'ツアー', 'フェス', 'ワンマン']],
];

/** 文字からカテゴリーを推測する。手がかりがなければ null */
export function guessCategory(text) {
  const lowered = ` ${String(text ?? '').toLowerCase().replace(/\n/g, ' ')} `;
  const match = CLUES.find(([, words]) => words.some((w) => lowered.includes(w.toLowerCase())));
  if (match) return match[0];
  // 「〇〇展」で終わる語（「北斎展」など）
  return /\S展[\s」』]/.test(lowered) ? '展示会' : null;
}

/** AI の答えなど、自由な言い方のカテゴリーを選択肢にそろえる。合わなければ「その他」 */
export function categoryFromAnswer(answer) {
  const trimmed = String(answer ?? '').trim();
  if (CATEGORIES.includes(trimmed)) return trimmed;
  return guessCategory(trimmed) ?? 'その他';
}
