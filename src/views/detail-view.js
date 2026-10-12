// 半券の詳細：画像（タップで全画面・拡大）、全項目、コメント、編集、削除。
import { useEffect, useState } from 'preact/hooks';
import { html } from '../html.js';
import { useData } from '../data.js';
import { compareText } from '../model/text.js';
import { SEAT_FIELDS, SEAT_LABELS } from '../model/ticket.js';
import { formatDate, formatPrice, categoryIcon } from '../format.js';
import { goBack, navigate, href } from '../router.js';
import { Missing, useObjectUrl } from './common.js';
import { ZoomableImage } from './zoomable-image.js';

export function DetailView({ ticketId }) {
  const { tickets, performersById, loaded, store, mutate } = useData();
  const ticket = tickets.find((t) => t.id === ticketId);
  const [original, setOriginal] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const imageUrl = useObjectUrl(original);

  // 元画像は詳細を開いたときだけ読む（一覧はサムネイルだけ）
  useEffect(() => {
    if (!store || !ticket?.hasImage) {
      setOriginal(null);
      return;
    }
    let alive = true;
    store.getOriginal(ticket.id).then((blob) => alive && setOriginal(blob ?? null));
    return () => {
      alive = false;
    };
  }, [store, ticket?.id, ticket?.updatedAt]);

  if (!loaded) return null;
  if (!ticket) return html`<${Missing} />`;

  const remove = async () => {
    if (!confirm(`「${ticket.title}」を削除しますか？\nこの操作は取り消せません。`)) return;
    await mutate((s) => s.deleteTicket(ticket.id));
    goBack();
  };

  const performers = ticket.performerIds.map((id) => performersById.get(id)).filter(Boolean).sort((a, b) => compareText(a.name, b.name));
  const seats = SEAT_FIELDS.filter((k) => ticket.seat?.[k]).map((k) => ({ label: SEAT_LABELS[k], value: ticket.seat[k] }));
  const times = [ticket.openTime && `開場 ${ticket.openTime}`, ticket.startTime && `開演 ${ticket.startTime}`].filter(Boolean).join('　');

  return html`
    <div class="screen">
      <header class="nav-bar">
        <button class="nav-back" onClick=${goBack}>‹ 戻る</button>
        <h1></h1>
        <button class="nav-side nav-strong" onClick=${() => navigate('edit', ticket.id)}>編集</button>
      </header>
      <main class="content detail">
        ${ticket.hasImage
          ? html`<button class="detail-image" onClick=${() => imageUrl && setFullscreen(true)} aria-label="画像を大きく表示">
              ${imageUrl ? html`<img src=${imageUrl} alt="半券の画像" />` : html`<div class="detail-image-loading"></div>`}
            </button>`
          : html`<div class="detail-image detail-no-image" aria-hidden="true">${categoryIcon(ticket.category)}</div>`}

        <h2 class="detail-title">${ticket.title}</h2>
        ${ticket.subtitle && html`<p class="detail-subtitle">${ticket.subtitle}</p>`}

        <dl class="detail-facts card">
          ${performers.length > 0 && html`<dt>出演者</dt><dd>${performers.map((p, i) => html`${i > 0 ? '、' : ''}<a href=${href('performer', p.id)}>${p.name}</a>`)}</dd>`}
          ${ticket.category && html`<dt>カテゴリー</dt><dd>${ticket.category}</dd>`}
          <dt>公演日</dt><dd>${formatDate(ticket.performanceDate)}</dd>
          ${times && html`<dt>時刻</dt><dd>${times}</dd>`}
          ${ticket.venue && html`<dt>会場</dt><dd>${ticket.venue}</dd>`}
          ${seats.length > 0 && html`<dt>席</dt><dd>${seats.map((s) => html`<span class="seat-part"><span class="seat-label">${s.label}</span> ${s.value}</span>`)}</dd>`}
          ${ticket.price != null && html`<dt>価格</dt><dd>${formatPrice(ticket.price)}</dd>`}
          ${ticket.issuer && html`<dt>発券元</dt><dd>${ticket.issuer}</dd>`}
        </dl>

        ${ticket.comment && html`
          <section class="card">
            <h3 class="card-title">コメント</h3>
            <p class="detail-comment">${ticket.comment}</p>
          </section>
        `}

        ${ticket.ocrText && html`
          <details class="card">
            <summary>読み取った文字</summary>
            <p class="detail-comment">${ticket.ocrText}</p>
          </details>
        `}

        <p class="note detail-dates">
          登録 ${new Date(ticket.createdAt).toLocaleString('ja-JP')}${ticket.updatedAt !== ticket.createdAt ? `　更新 ${new Date(ticket.updatedAt).toLocaleString('ja-JP')}` : ''}
        </p>

        <button class="button danger-text wide" onClick=${remove}>この半券を削除</button>
      </main>

      ${fullscreen && imageUrl && html`<${FullscreenImage} src=${imageUrl} onClose=${() => setFullscreen(false)} />`}
    </div>
  `;
}

/** 全画面の画像。ピンチ・ダブルタップで拡大、× で閉じる */
function FullscreenImage({ src, onClose }) {
  // 開いている間は後ろの画面がスクロールしないようにする
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  return html`
    <div class="fullscreen" role="dialog" aria-label="半券の画像">
      <${ZoomableImage} src=${src} alt="半券の画像" />
      <button class="fullscreen-close" onClick=${onClose} aria-label="閉じる">×</button>
    </div>
  `;
}
