// 表示の選択（一覧の表示方法・リスト／ギャラリー）を覚えておく。
// 消えても困らない値なので localStorage に置く（使えない環境では初期値のまま動く）。

const PREFIX = 'ticket-web:';

export function loadPref(key, fallback) {
  try {
    const value = localStorage.getItem(PREFIX + key);
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function savePref(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 保存できなくても表示は続ける
  }
}
