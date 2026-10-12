// 画面どうしで使う小さな部品。
import { useEffect, useMemo } from 'preact/hooks';
import { html } from '../html.js';
import { goBack } from '../router.js';

/** Blob の表示用 URL。Blob が変わったら古い URL を手放す */
export function useObjectUrl(blob) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return url;
}

/** 開こうとした半券がない（削除された・URL が古い） */
export function Missing() {
  return html`
    <div class="screen">
      <header class="nav-bar">
        <button class="nav-back" onClick=${goBack}>‹ 戻る</button>
        <h1>半券</h1>
      </header>
      <main class="content"><div class="empty"><p>この半券は見つかりません。削除された可能性があります。</p></div></main>
    </div>
  `;
}
