// めくって見る画面：ギャラリーと同じ並びで、画像のある半券を全画面で左右にめくる。
// ピンチ・ダブルタップで拡大し、拡大中はめくらずに画像を動かす。タップで文字やボタンを隠す。横向きにも対応。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { html } from '../html.js';
import { useData } from '../data.js';
import { groupTickets, viewableTickets } from '../model/grouping.js';
import { formatDate } from '../format.js';
import { loadPref } from '../prefs.js';
import { goBack, navigate } from '../router.js';
import { getViewerOrder } from '../viewer-order.js';
import { ZoomableImage } from './zoomable-image.js';
import { nextPage, dragOffset } from './pager-math.js';

const AXIS_THRESHOLD = 8;

export function ViewerView({ ticketId }) {
  const { tickets, performersById, loaded } = useData();

  // 並び：ギャラリーで見えていた並び。一覧を通らずに開いたときは、保存した表示方法で全件から
  const list = useMemo(() => {
    const byId = new Map(tickets.map((t) => [t.id, t]));
    const order = getViewerOrder();
    if (order) return order.map((id) => byId.get(id)).filter((t) => t?.hasImage);
    return viewableTickets(groupTickets(tickets, loadPref('listMode', 'newest'), performersById));
  }, [tickets, performersById]);

  const [index, setIndex] = useState(() => Math.max(0, list.findIndex((t) => t.id === ticketId)));
  // データの読み込みが後から終わったときは、開いた半券の位置に合わせ直す
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || !loaded) return;
    placed.current = true;
    setIndex(Math.max(0, list.findIndex((t) => t.id === ticketId)));
  }, [loaded, list]);

  const current = list[index];
  const [chrome, setChrome] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [width, setWidth] = useState(() => window.innerWidth);
  const [drag, setDrag] = useState(null);
  const box = useRef(null);
  const gesture = useRef(null);
  const pointers = useRef(new Set());

  // 今の半券を URL に反映（戻る操作でギャラリーへ戻れるよう、履歴は増やさない）
  useEffect(() => {
    if (current) history.replaceState(null, '', `#/view/${encodeURIComponent(current.id)}`);
  }, [current?.id]);

  // 回転・大きさの変化：1ページの幅を測り直す（位置は index のまま）
  useLayoutEffect(() => {
    const measure = () => box.current && setWidth(box.current.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [loaded]);

  // 後ろの画面がスクロールしないようにする
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  // PC ではキーボードの左右でもめくる
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(list.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'Escape') goBack();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [list.length]);

  // めくったら拡大の状態を戻す（拡大していた画像は離れると等倍に戻る）
  useEffect(() => setZoomed(false), [index]);

  const urls = useNearbyOriginals(list, index);

  if (!loaded) return null;
  if (list.length === 0) {
    return html`
      <div class="viewer">
        <div class="viewer-empty"><p>画像のある半券がありません。</p><button class="button" onClick=${goBack}>戻る</button></div>
      </div>
    `;
  }

  // めくる操作。画像の拡大・移動は ZoomableImage が受け持ち、拡大していないときの横の動きだけをここで扱う
  const onPointerDown = (e) => {
    pointers.current.add(e.pointerId);
    if (pointers.current.size > 1) {
      // 2本指はピンチなのでめくらない
      gesture.current = null;
      setDrag(null);
      return;
    }
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), axis: null };
  };
  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId || zoomed) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) < AXIS_THRESHOLD && Math.abs(dy) < AXIS_THRESHOLD) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (g.axis === 'x') setDrag(dragOffset({ index, count: list.length, dx }));
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== e.pointerId || g.axis !== 'x') {
      setDrag(null);
      return;
    }
    const dx = e.clientX - g.x;
    const velocity = dx / Math.max(1, performance.now() - g.t);
    setIndex(nextPage({ index, count: list.length, dx, width, velocity }));
    setDrag(null);
  };

  const offset = -index * width + (drag ?? 0);
  const n = list.length;

  return html`
    <div class="viewer" role="dialog" aria-label="半券をめくって見る">
      <div
        class="viewer-pages"
        ref=${box}
        onPointerDown=${onPointerDown}
        onPointerMove=${onPointerMove}
        onPointerUp=${onPointerUp}
        onPointerCancel=${onPointerUp}
      >
        <div class=${`viewer-track ${drag == null ? 'animate' : ''}`} style=${{ transform: `translateX(${offset}px)` }}>
          ${list.map((t, i) => html`
            <div class="viewer-page" key=${t.id} style=${{ left: `${i * width}px`, width: `${width}px` }}>
              ${Math.abs(i - index) <= 1 && urls.get(t.id) && html`
                <${ZoomableImage}
                  src=${urls.get(t.id)}
                  alt=${t.title}
                  resetKey=${i === index ? 'current' : `away-${index}`}
                  onTap=${() => setChrome((c) => !c)}
                  onZoomChange=${i === index ? setZoomed : undefined}
                />
              `}
            </div>
          `)}
        </div>
      </div>

      <header class=${`viewer-top ${chrome ? '' : 'hidden-chrome'}`}>
        <button class="viewer-round" onClick=${goBack} aria-label="閉じる">×</button>
        <span class="viewer-count">${index + 1} / ${n}</span>
        <button class="viewer-pill" onClick=${() => navigate('ticket', current.id)}>詳細</button>
      </header>
      <footer class=${`viewer-bottom ${chrome ? '' : 'hidden-chrome'}`}>
        <div class="viewer-title">${current.title}</div>
        ${current.subtitle && html`<div class="viewer-sub">${current.subtitle}</div>`}
        <div class="viewer-sub">${[formatDate(current.performanceDate), current.venue].filter(Boolean).join('　')}</div>
      </footer>
    </div>
  `;
}

/** 今の半券と前後1枚の元画像を読み、離れた半券の URL は手放す */
function useNearbyOriginals(list, index) {
  const { store } = useData();
  const [urls, setUrls] = useState(() => new Map());
  const held = useRef(new Map());

  useEffect(() => {
    if (!store) return;
    const wanted = new Set(list.slice(Math.max(0, index - 1), index + 2).map((t) => t.id));
    for (const [id, url] of held.current) {
      if (!wanted.has(id)) {
        URL.revokeObjectURL(url);
        held.current.delete(id);
      }
    }
    let alive = true;
    (async () => {
      for (const id of wanted) {
        if (held.current.has(id)) continue;
        const blob = await store.getOriginal(id);
        if (!alive) return;
        if (blob) held.current.set(id, URL.createObjectURL(blob));
      }
      setUrls(new Map(held.current));
    })();
    setUrls(new Map(held.current));
    return () => {
      alive = false;
    };
  }, [store, list, index]);

  useEffect(() => () => {
    for (const url of held.current.values()) URL.revokeObjectURL(url);
    held.current.clear();
  }, []);

  return urls;
}
