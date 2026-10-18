// 使い方の案内：ブラウザで開いているときのホーム画面への追加、半券がまだないときの始め方。
import { html } from '../html.js';
import { href } from '../router.js';

/** ブラウザ（Safari）で開いているときに一覧の上に出す */
export function InstallHint() {
  return html`
    <details class="guide-card install-hint">
      <summary>📲 ホーム画面に追加して使ってください</summary>
      <p>ブラウザで開いたままだと、しばらく使わないうちにデータが消えることがあります。</p>
      <ol>
        <li>Safari の「…」または共有ボタン（□↑）→「共有」</li>
        <li>「ホーム画面に追加」を選ぶ</li>
        <li>「Webアプリとして開く」をオンにして「追加」</li>
        <li>ホーム画面の「半券」アイコンから開く</li>
      </ol>
      <p class="note">ホーム画面のアプリは、ブラウザとは別にデータを持ちます。ブラウザで登録した半券は、設定の書き出し・読み込みで移せます。</p>
    </details>
  `;
}

/** 半券がまだないときの始め方 */
export function GettingStarted() {
  return html`
    <div class="empty getting-started">
      <p>まだ半券がありません。</p>
      <p><a class="button primary" href=${href('new')}>半券を追加</a></p>
      <ol class="guide-steps">
        <li><strong>撮る</strong>：「＋」→「撮影」か「写真を選ぶ」。半券の四隅を合わせて切り抜きます</li>
        <li><strong>AI で読み取る</strong>（任意）：指示文をコピーし、画像を共有メニューでお使いの AI アプリに送ります。AI の答えを貼り付けると、公演名・日付・会場などが入ります</li>
        <li><strong>バックアップ</strong>：データはこの端末の中にだけあります。ときどき設定から書き出して「ファイル」やクラウドに保存してください</li>
      </ol>
      <p class="note"><a href=${href('settings')}>設定</a>からバックアップを読み込むこともできます。</p>
    </div>
  `;
}
