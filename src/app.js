import { render } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { html } from './html.js';
import { registerServiceWorker, applyUpdate } from './sw-register.js';
import { DataProvider, useTicketData } from './data.js';
import { useRoute, goBack } from './router.js';
import { ListView } from './views/list-view.js';
import { SettingsView } from './views/settings-view.js';
import { EditView } from './views/edit-view.js';
import { DetailView } from './views/detail-view.js';
import { ViewerView } from './views/viewer-view.js';
import { PerformerListView, PerformerEditView } from './views/performers-view.js';
import { releaseThumbnails } from './views/thumbnail.js';

function App() {
  const route = useRoute();
  const data = useTicketData();
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    registerServiceWorker('sw.js', { onUpdate: () => setUpdateReady(true) }).catch((e) => console.error(e));
    // Safari がデータを消さないよう求める（ホーム画面に追加した状態だと認められやすい）
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  useEffect(() => {
    releaseThumbnails(new Set(data.tickets.map((t) => t.id)));
  }, [data.tickets]);

  // 一覧は隠すだけで残し（検索語などを保つ）、戻ったときに元のスクロール位置へ。ほかの画面は先頭から
  const listScroll = useRef(0);
  const previousRoute = useRef(route.name);
  useLayoutEffect(() => {
    const from = previousRoute.current;
    previousRoute.current = route.name;
    if (route.name === 'list') {
      if (from !== 'list') window.scrollTo(0, listScroll.current);
    } else {
      window.scrollTo(0, 0);
    }
  }, [route.name, route.params.join('/')]);
  useEffect(() => {
    const onScroll = () => {
      if (previousRoute.current === 'list') listScroll.current = window.scrollY;
    };
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);

  if (data.error) {
    return html`<main class="screen"><div class="empty"><p>データを開けませんでした。</p><pre>${String(data.error)}</pre></div></main>`;
  }

  return html`
    <${DataProvider} value=${data}>
      <div class=${route.name === 'list' ? '' : 'hidden'}><${ListView} /></div>
      ${route.name === 'settings' && html`<${SettingsView} />`}
      ${route.name === 'new' && html`<${EditView} key="new" ticketId=${null} />`}
      ${route.name === 'edit' && html`<${EditView} key=${`edit-${route.params[0]}`} ticketId=${route.params[0]} />`}
      ${route.name === 'ticket' && html`<${DetailView} key=${route.params[0]} ticketId=${route.params[0]} />`}
      ${route.name === 'view' && html`<${ViewerView} ticketId=${route.params[0]} />`}
      ${route.name === 'performers' && html`<${PerformerListView} />`}
      ${route.name === 'performer' && html`<${PerformerEditView} key=${route.params[0]} performerId=${route.params[0]} />`}
      ${!KNOWN_ROUTES.includes(route.name) && html`<${Placeholder} route=${route} />`}
      ${updateReady && html`
        <div class="banner" role="status">
          <span>新しい版があります</span>
          <button onClick=${applyUpdate}>更新する</button>
        </div>
      `}
    <//>
  `;
}

const KNOWN_ROUTES = ['list', 'settings', 'new', 'edit', 'ticket', 'view', 'performers', 'performer'];

/** まだ作っていない画面 */
function Placeholder({ route }) {
  const names = {};
  return html`
    <div class="screen">
      <header class="nav-bar">
        <button class="nav-back" onClick=${goBack}>‹ 戻る</button>
        <h1>${names[route.name] ?? 'ページがありません'}</h1>
      </header>
      <main class="content"><div class="empty"><p>この画面はまだ作っていません。</p></div></main>
    </div>
  `;
}

render(html`<${App} />`, document.getElementById('app'));
