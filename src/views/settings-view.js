// 設定：版・データの保護・件数。バックアップは Phase 7 でここに足す。
import { useEffect, useState } from 'preact/hooks';
import { html } from '../html.js';
import { useData } from '../data.js';
import { goBack } from '../router.js';
import { serviceWorkerVersion } from '../sw-register.js';

export function SettingsView() {
  const { tickets, performers } = useData();
  const [version, setVersion] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    serviceWorkerVersion().then(setVersion);
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(false));
    navigator.storage?.estimate?.().then((e) => setUsage(e.usage)).catch(() => {});
  }, []);

  return html`
    <div class="screen">
      <header class="nav-bar">
        <button class="nav-back" onClick=${goBack}>‹ 戻る</button>
        <h1>設定</h1>
      </header>
      <main class="content">
        <section class="card">
          <dl class="facts">
            <dt>半券</dt><dd>${tickets.length}枚</dd>
            <dt>出演者</dt><dd>${performers.length}人</dd>
            <dt>使用容量</dt><dd>${usage == null ? '—' : `${(usage / 1024 / 1024).toFixed(1)}MB`}</dd>
            <dt>データの保護</dt><dd>${persisted == null ? '確認中' : persisted ? '有効' : '未許可'}</dd>
            <dt>版</dt><dd>${version ?? '—'}</dd>
          </dl>
          ${persisted === false && html`
            <p class="note">
              ホーム画面に追加したアプリから使ってください。Safari で開いたままだと、しばらく使わないうちにデータが消えることがあります。
            </p>
          `}
        </section>
        <p class="note"><a href="dev/check.html">実機確認ページ</a></p>
      </main>
    </div>
  `;
}
