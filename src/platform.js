// 動いている環境の判定。

/** ホーム画面に追加したアプリ（standalone）として開いているか */
export function isStandalone(nav = globalThis.navigator, matchMedia = globalThis.matchMedia) {
  if (nav?.standalone === true) return true;
  try {
    return matchMedia?.('(display-mode: standalone)').matches === true;
  } catch {
    return false;
  }
}
