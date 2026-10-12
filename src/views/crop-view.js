// 切り抜き画面：写真の上に半券の四隅の点を置き、指で動かして合わせる。動かしている間は指の上に拡大鏡を出す。
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { html } from '../html.js';
import { useObjectUrl } from './common.js';
import { containSize } from './zoom-math.js';
import { defaultQuad, fullQuad, orderCorners } from '../model/crop.js';

const LOUPE_SIZE = 112;
const LOUPE_ZOOM = 2.5;

/**
 * @param source 切り抜く前の写真（Blob）
 * @param initialQuad 最初に置く四隅（0〜1）。null なら少し内側の長方形
 * @param autoQuad 自動で推定した四隅（「自動」で戻せるように）。null なら推定できなかった
 * @param onConfirm (quad) => void
 */
export function CropView({ source, initialQuad, autoQuad, onCancel, onConfirm, busy = false }) {
  const url = useObjectUrl(source);
  const stage = useRef(null);
  const [natural, setNatural] = useState(null);
  const [frame, setFrame] = useState(null);
  const [quad, setQuad] = useState(() => initialQuad ?? autoQuad ?? defaultQuad());
  const [drag, setDrag] = useState(null);

  // 後ろの画面がスクロールしないようにする
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  // 写真を表示する範囲（画面の回転・大きさの変化にもついていく）
  useLayoutEffect(() => {
    if (!natural || !stage.current) return;
    const measure = () => {
      const rect = stage.current.getBoundingClientRect();
      const size = containSize(natural, rect);
      setFrame({ left: (rect.width - size.width) / 2, top: (rect.height - size.height) / 2, ...size, stageWidth: rect.width });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [natural]);

  const toScreen = (p) => ({ x: frame.left + p.x * frame.width, y: frame.top + p.y * frame.height });

  const onHandleDown = (index) => (e) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 指がもう離れている */ }
    const rect = stage.current.getBoundingClientRect();
    const at = toScreen(quad[index]);
    // 指と点のずれを保ち、触った瞬間に点が跳ばないようにする
    setDrag({ index, pointerId: e.pointerId, dx: at.x - (e.clientX - rect.left), dy: at.y - (e.clientY - rect.top) });
  };

  const onHandleMove = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const rect = stage.current.getBoundingClientRect();
    const x = (e.clientX - rect.left + drag.dx - frame.left) / frame.width;
    const y = (e.clientY - rect.top + drag.dy - frame.top) / frame.height;
    setQuad((q) => q.map((p, i) => (i === drag.index ? { x: clamp01(x), y: clamp01(y) } : p)));
  };

  const onHandleUp = (e) => {
    if (drag && e.pointerId === drag.pointerId) setDrag(null);
  };

  const confirm = () => onConfirm(orderCorners(quad));

  const points = frame ? quad.map(toScreen) : [];

  return html`
    <div class="crop-screen" role="dialog" aria-label="半券の切り抜き">
      <header class="crop-bar">
        <button class="nav-side crop-light" onClick=${onCancel} disabled=${busy}>キャンセル</button>
        <h1>四隅を合わせる</h1>
        <button class="nav-side nav-strong crop-light" onClick=${confirm} disabled=${busy || !frame}>${busy ? '処理中' : '切り抜く'}</button>
      </header>
      <div class="crop-stage" ref=${stage} onPointerMove=${onHandleMove} onPointerUp=${onHandleUp} onPointerCancel=${onHandleUp}>
        <img class="crop-photo" src=${url} alt="撮った写真" draggable="false"
          onLoad=${(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} />
        ${frame && html`
          <svg class="crop-overlay" width="100%" height="100%">
            <defs>
              <mask id="crop-hole">
                <rect width="100%" height="100%" fill="white" />
                <polygon points=${points.map((p) => `${p.x},${p.y}`).join(' ')} fill="black" />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#crop-hole)" />
            <polygon class="crop-outline" points=${points.map((p) => `${p.x},${p.y}`).join(' ')} />
          </svg>
          ${points.map((p, i) => html`
            <div
              key=${i}
              class=${`crop-handle ${drag?.index === i ? 'active' : ''}`}
              style=${{ left: `${p.x}px`, top: `${p.y}px` }}
              onPointerDown=${onHandleDown(i)}
              aria-label=${['左上', '右上', '右下', '左下'][i] + 'の角'}
            ><span></span></div>
          `)}
          ${drag && html`<${Loupe} url=${url} frame=${frame} point=${quad[drag.index]} at=${points[drag.index]} />`}
        `}
      </div>
      <footer class="crop-footer">
        <button class="button" onClick=${() => setQuad(fullQuad())} disabled=${busy}>全体を使う</button>
        ${autoQuad && html`<button class="button" onClick=${() => setQuad(autoQuad)} disabled=${busy}>自動で合わせる</button>`}
      </footer>
      ${!autoQuad && !initialQuad && html`<p class="crop-hint">半券の位置を自動で見つけられませんでした。四隅の点を半券の角に合わせてください。</p>`}
    </div>
  `;
}

/** 指で隠れる角を、指の上に拡大して見せる */
function Loupe({ url, frame, point, at }) {
  const half = LOUPE_SIZE / 2;
  // 上に出す余裕がなければ下に出す
  const top = at.y - LOUPE_SIZE - 40 < 0 ? at.y + 40 : at.y - LOUPE_SIZE - 40;
  const left = Math.min(Math.max(at.x - half, 4), frame.stageWidth - LOUPE_SIZE - 4);
  const bgWidth = frame.width * LOUPE_ZOOM;
  const bgHeight = frame.height * LOUPE_ZOOM;
  return html`
    <div class="crop-loupe" style=${{
      top: `${top}px`,
      left: `${left}px`,
      width: `${LOUPE_SIZE}px`,
      height: `${LOUPE_SIZE}px`,
      backgroundImage: `url(${url})`,
      backgroundSize: `${bgWidth}px ${bgHeight}px`,
      backgroundPosition: `${half - point.x * bgWidth}px ${half - point.y * bgHeight}px`,
    }}><span class="crop-loupe-cross"></span></div>
  `;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
