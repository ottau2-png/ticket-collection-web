// AI で読み取る：①指示文をコピー ②画像を共有メニューで AI アプリへ ③答えを貼り付け → 読み取れた項目を確かめてから反映。
// 貼り付けた答えはただの文字として扱い、反映する前に中身を見せる（iOS 版で ChatGPT の答えを取り込むと固まった反省）。
import { useEffect, useMemo, useState } from 'preact/hooks';
import { html } from '../html.js';
import { AI_PROMPT, parseAIAnswer } from '../model/ai-format.js';

/**
 * @param getImage () => Promise<Blob | null> 共有する画像（切り抜いた画像）。なければ null
 * @param onApply (parsed) => void
 */
export function AIReadSheet({ hasImage, getImage, onApply, onClose }) {
  const [answer, setAnswer] = useState('');
  const [copyState, setCopyState] = useState(null);
  const [shareState, setShareState] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const result = useMemo(() => (answer.trim() ? parseAIAnswer(answer) : null), [answer]);

  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      setCopyState('ok');
    } catch {
      // コピーできない環境では、指示文を表示して手で選んでもらう
      setCopyState('ng');
      setShowPrompt(true);
    }
  };

  const shareImage = async () => {
    setShareState(null);
    try {
      const blob = await getImage();
      if (!blob) throw new Error('画像がありません');
      // 保存済みの JPEG をそのまま渡す（描き直し・変換をしない）
      const file = new File([blob], 'ticket.jpg', { type: 'image/jpeg' });
      if (!navigator.canShare?.({ files: [file] })) throw new Error('この端末では画像を共有できません');
      await navigator.share({ files: [file] });
      setShareState('ok');
    } catch (e) {
      if (e?.name === 'AbortError') return;
      setShareState(e.message ?? String(e));
    }
  };

  return html`
    <div class="sheet-backdrop" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-label="AIで読み取る">
        <header class="sheet-bar">
          <button class="nav-side" onClick=${onClose}>閉じる</button>
          <h1>AIで読み取る</h1>
          <span class="nav-side"></span>
        </header>
        <div class="sheet-body">
          <ol class="steps">
            <li>
              <p>指示文をコピーする</p>
              <button class="button" onClick=${copyPrompt}>📋 指示文をコピー</button>
              ${copyState === 'ok' && html`<span class="step-done">コピーしました</span>`}
              ${copyState === 'ng' && html`<p class="note">コピーできませんでした。下の指示文を長押しで選んでコピーしてください。</p>`}
              <button class="link-button" onClick=${() => setShowPrompt((v) => !v)}>${showPrompt ? '指示文を隠す' : '指示文を見る'}</button>
              ${showPrompt && html`<pre class="prompt-text">${AI_PROMPT}</pre>`}
            </li>
            <li>
              <p>半券の画像を AI アプリ（Claude など）に送り、指示文を貼り付けて送信する</p>
              ${hasImage
                ? html`<button class="button" onClick=${shareImage}>📤 画像を共有</button>`
                : html`<p class="note">画像がありません。先に撮影するか写真を選んでください。</p>`}
              ${shareState && shareState !== 'ok' && html`<p class="note error-text">${shareState}</p>`}
            </li>
            <li>
              <p>AI の答えをコピーして、ここに貼り付ける</p>
              <textarea
                class="answer-input"
                rows="6"
                placeholder="ここを長押しして貼り付け"
                value=${answer}
                onInput=${(e) => setAnswer(e.currentTarget.value)}
              ></textarea>
            </li>
          </ol>

          ${answer.trim() && !result && html`<p class="error">読み取れませんでした。「公演名: 〜」のような行が見つかりません。</p>`}
          ${result && html`
            <section class="ai-result">
              <h2>読み取れた項目（${result.values.length}）</h2>
              <dl class="facts">
                ${result.values.map(([label, value]) => html`<dt>${label}</dt><dd>${value}</dd>`)}
              </dl>
              <p class="note">反映すると、入力済みの欄も上書きします（答えが空の項目はそのまま）。</p>
              <button class="button primary wide" onClick=${() => onApply(result.parsed)}>${result.values.length}項目を反映</button>
            </section>
          `}
        </div>
      </div>
    </div>
  `;
}
