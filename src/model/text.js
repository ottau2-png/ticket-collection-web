// 文字の正規化と、入力欄の値の解釈。

/**
 * 大文字小文字・全角半角の違いを無視して比べるためのキー。
 * NFKC で全角英数字→半角、半角カナ→全角にそろえてから小文字にする。
 */
export function normalizeKey(text) {
  return String(text ?? '').normalize('NFKC').toLowerCase().trim();
}

/** 出演者欄のテキストを「、」「,」「，」改行で分け、空欄と重複（表記ゆれ程度の違いを含む）を除く */
export function splitNames(text) {
  const seen = new Set();
  const names = [];
  for (const raw of String(text ?? '').split(/[、,，\n]/)) {
    const name = raw.trim();
    const key = normalizeKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** 「8,800円」「¥12,000」「８８００」のような入力から金額を取り出す。数字がなければ null */
export function parsePrice(text) {
  const digits = String(text ?? '').normalize('NFKC').replace(/[^0-9]/g, '');
  return digits ? Number.parseInt(digits, 10) : null;
}

const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });

/** 表示順の比較（数字は数として、大文字小文字は区別しない）。英字→かな→漢字の順 */
export function compareText(a, b) {
  return collator.compare(a, b);
}
