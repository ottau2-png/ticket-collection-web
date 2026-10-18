// 一覧：表示方法の切替、リスト／ギャラリー、検索、削除。
import { useMemo, useState } from 'preact/hooks';
import { html } from '../html.js';
import { useData } from '../data.js';
import { LIST_MODES, groupTickets, filterTickets, viewableTickets } from '../model/grouping.js';
import { setViewerOrder } from '../viewer-order.js';
import { backupIsStale } from '../model/backup-reminder.js';
import { performerNamesOf } from '../model/performers.js';
import { ticketMetaLine, formatDate } from '../format.js';
import { loadPref, savePref } from '../prefs.js';
import { href, navigate } from '../router.js';
import { Thumbnail } from './thumbnail.js';
import { InstallHint, GettingStarted } from './guide.js';
import { isStandalone } from '../platform.js';
import { useSwipeToReveal, useLongPress } from './gestures.js';

function usePref(key, fallback, valid) {
  const [value, setValue] = useState(() => {
    const saved = loadPref(key, fallback);
    return valid(saved) ? saved : fallback;
  });
  const set = (v) => {
    setValue(v);
    savePref(key, v);
  };
  return [value, set];
}

export function ListView() {
  const { tickets, performersById, mutate, loaded, lastExportAt } = useData();
  const [mode, setMode] = usePref('listMode', 'newest', (v) => LIST_MODES.some((m) => m.id === v));
  const [layout, setLayout] = usePref('listLayout', 'list', (v) => v === 'list' || v === 'gallery');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => filterTickets(tickets, query, performersById), [tickets, query, performersById]);
  const sections = useMemo(
    () => groupTickets(filtered, mode, performersById).filter((s) => s.tickets.length > 0),
    [filtered, mode, performersById],
  );

  // めくる画面は、ギャラリーで今見えている並びのまま開く
  setViewerOrder(viewableTickets(sections).map((t) => t.id));

  const confirmDelete = async (ticket) => {
    if (!confirm(`「${ticket.title}」を削除しますか？\nこの操作は取り消せません。`)) return false;
    await mutate((store) => store.deleteTicket(ticket.id));
    return true;
  };

  const empty = loaded && tickets.length === 0;
  const standalone = useMemo(() => isStandalone(), []);
  const noMatch = !empty && filtered.length === 0;

  return html`
    <div class="screen">
      <header class="list-header">
        <div class="title-row">
          <h1>半券コレクション</h1>
          <nav class="header-actions">
            <a class="icon-button" href=${href('performers')} aria-label="出演者">👥</a>
            <a class="icon-button" href=${href('settings')} aria-label="設定">⚙️</a>
            <a class="icon-button primary" href=${href('new')} aria-label="半券を追加">＋</a>
          </nav>
        </div>
        <div class="controls">
          <select class="mode-select" value=${mode} onChange=${(e) => setMode(e.currentTarget.value)} aria-label="表示方法">
            ${LIST_MODES.map((m) => html`<option value=${m.id}>${m.label}</option>`)}
          </select>
          <div class="segmented" role="group" aria-label="表示の形">
            <button class=${layout === 'list' ? 'selected' : ''} onClick=${() => setLayout('list')} aria-pressed=${layout === 'list'}>リスト</button>
            <button class=${layout === 'gallery' ? 'selected' : ''} onClick=${() => setLayout('gallery')} aria-pressed=${layout === 'gallery'}>ギャラリー</button>
          </div>
        </div>
        <div class="search">
          <input
            type="search"
            placeholder="公演名・出演者・会場などで検索"
            value=${query}
            onInput=${(e) => setQuery(e.currentTarget.value)}
            enterkeyhint="search"
            autocomplete="off"
          />
        </div>
      </header>

      <main class="list-body">
        ${!standalone && html`<${InstallHint} />`}
        ${loaded && backupIsStale(lastExportAt, tickets.length) && html`
          <a class="backup-reminder" href=${href('settings')}>
            💾 ${lastExportAt ? '最後のバックアップから30日以上経っています' : 'まだバックアップを書き出していません'}。設定から書き出せます ›
          </a>
        `}
        ${empty && html`<${GettingStarted} />`}
        ${noMatch && html`<div class="empty"><p>「${query}」に一致する半券はありません。</p></div>`}
        ${sections.map((section) => html`
          <section class="ticket-section" key=${section.id}>
            ${section.title && html`<h2 class="section-title">${section.title}</h2>`}
            ${layout === 'list'
              ? html`<ul class="ticket-list">
                  ${section.tickets.map((t) => html`
                    <${TicketRow} key=${t.id} ticket=${t} performersById=${performersById} onDelete=${confirmDelete} />
                  `)}
                </ul>`
              : html`<div class="gallery">
                  ${section.tickets.map((t) => html`<${GalleryTile} key=${t.id} ticket=${t} onDelete=${confirmDelete} />`)}
                </div>`}
          </section>
        `)}
      </main>
    </div>
  `;
}

function TicketRow({ ticket, performersById, onDelete }) {
  const swipe = useSwipeToReveal();
  const performers = performerNamesOf(ticket, performersById).join('、');

  const open = () => {
    if (swipe.consumeClick()) return;
    navigate('ticket', ticket.id);
  };
  const remove = async () => {
    const deleted = await onDelete(ticket);
    if (!deleted) swipe.close();
  };

  return html`
    <li class="swipe-row">
      <button class="swipe-delete" style=${{ width: `${swipe.deleteWidth}px` }} onClick=${remove} tabindex=${swipe.offset ? 0 : -1}>
        削除
      </button>
      <div
        class=${`ticket-row ${swipe.dragging ? 'dragging' : ''}`}
        style=${{ transform: `translateX(${swipe.offset}px)` }}
        role="button"
        tabindex="0"
        onClick=${open}
        onKeyDown=${(e) => e.key === 'Enter' && open()}
        ...${swipe.handlers}
      >
        <${Thumbnail} ticket=${ticket} className="row-thumb" />
        <div class="row-text">
          <div class="row-title">${ticket.title}</div>
          ${performers && html`<div class="row-performers">${performers}</div>`}
          <div class="row-meta">${ticketMetaLine(ticket)}</div>
        </div>
      </div>
    </li>
  `;
}

function GalleryTile({ ticket, onDelete }) {
  const press = useLongPress(() => onDelete(ticket));

  const open = () => {
    if (press.consumeClick()) return;
    // 画像のある半券は全画面でめくって見る。画像がなければ詳細
    navigate(ticket.hasImage ? 'view' : 'ticket', ticket.id);
  };

  return html`
    <button class="tile" onClick=${open} ...${press.handlers}>
      <div class="tile-image"><${Thumbnail} ticket=${ticket} className="tile-thumb" /></div>
      <div class="tile-title">${ticket.title}</div>
      <div class="tile-date">${formatDate(ticket.performanceDate)}</div>
    </button>
  `;
}
