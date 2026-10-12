import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { html } from './html.js';
import { registerServiceWorker, applyUpdate, serviceWorkerVersion } from './sw-register.js';

function App() {
  const [updateReady, setUpdateReady] = useState(false);
  const [version, setVersion] = useState(null);
  const [persisted, setPersisted] = useState(null);

  useEffect(() => {
    registerServiceWorker('sw.js', { onUpdate: () => setUpdateReady(true) })
      .then(() => navigator.serviceWorker?.ready)
      .then(() => serviceWorkerVersion())
      .then(setVersion)
      .catch((e) => console.error(e));
    // Safari がデータを消さないよう求める（ホーム画面に追加した状態だと認められやすい）
    navigator.storage?.persist?.().then(setPersisted).catch(() => setPersisted(false));
  }, []);

  return html`
    <main>
      <h1>チケット半券コレクション</h1>
      <div class="card">
        <p>準備中です。</p>
        <p class="muted">
          版：${version ?? '（未登録）'}<br />
          データの保護：${persisted == null ? '確認中' : persisted ? '有効' : '未許可'}
        </p>
        <p><a href="dev/check.html">実機確認ページ</a></p>
      </div>
      ${updateReady && html`
        <div class="banner" role="status">
          <span>新しい版があります</span>
          <button onClick=${applyUpdate}>更新する</button>
        </div>
      `}
    </main>
  `;
}

render(html`<${App} />`, document.getElementById('app'));
