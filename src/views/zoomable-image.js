// ピンチ・ダブルタップで拡大し、拡大中は指で動かせる画像。
// 動かせる範囲は拡大した分だけ（画像の端が画面の内側に入り込まない）。等倍に戻したら位置も戻す。
import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from '../html.js';
import { clampOffset, containSize } from './zoom-math.js';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 280;
const TAP_SLOP = 10;

/**
 * @param onTap 1回タップ（ダブルタップでないと分かってから呼ぶ）
 * @param onZoomChange 拡大中かどうかが変わったとき（めくる画面で、拡大中はめくらないため）
 * @param resetKey これが変わったら等倍に戻す
 */
export function ZoomableImage({ src, alt = '', onTap, onZoomChange, resetKey }) {
  const box = useRef(null);
  const img = useRef(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef(null);
  const tapTimer = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    setView({ scale: 1, x: 0, y: 0 });
  }, [resetKey, src]);

  useEffect(() => {
    onZoomChange?.(view.scale > 1.01);
  }, [view.scale > 1.01]);

  useEffect(() => () => clearTimeout(tapTimer.current), []);

  const sizes = () => {
    const rect = box.current.getBoundingClientRect();
    const container = { width: rect.width, height: rect.height };
    const natural = { width: img.current?.naturalWidth ?? 0, height: img.current?.naturalHeight ?? 0 };
    return { rect, container, content: containSize(natural, container) };
  };

  /** 画面上の点（container の中心からの位置）を固定したまま scale にする */
  const zoomAround = (base, point, scale) => {
    const { container, content } = sizes();
    const ratio = scale / base.scale;
    const offset = { x: point.x - (point.x - base.x) * ratio, y: point.y - (point.y - base.y) * ratio };
    return { scale, ...(scale <= 1 ? { x: 0, y: 0 } : clampOffset(offset, scale, content, container)) };
  };

  const relative = (e) => {
    const { rect } = sizes();
    return { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
  };

  const onPointerDown = (e) => {
    try { box.current.setPointerCapture?.(e.pointerId); } catch { /* 指がもう離れている */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setAnimate(false);
    const list = [...pointers.current.values()];
    if (list.length === 2) {
      const [a, b] = list;
      gesture.current = {
        type: 'pinch',
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        base: viewRef.current,
        mid: relative({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }),
      };
    } else if (list.length === 1) {
      gesture.current = { type: 'pan', start: { x: e.clientX, y: e.clientY }, base: viewRef.current, moved: false };
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const scale = Math.min(MAX_SCALE, Math.max(1, g.base.scale * (Math.hypot(a.x - b.x, a.y - b.y) / g.distance)));
      const mid = relative({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      // 指の中点の移動にもついていく
      const panned = { ...g.base, x: g.base.x + (mid.x - g.mid.x), y: g.base.y + (mid.y - g.mid.y) };
      setView(zoomAround(panned, mid, scale));
    } else if (g.type === 'pan') {
      const dx = e.clientX - g.start.x;
      const dy = e.clientY - g.start.y;
      if (Math.hypot(dx, dy) > TAP_SLOP) g.moved = true;
      if (g.base.scale > 1 && g.moved) {
        const { container, content } = sizes();
        setView({ scale: g.base.scale, ...clampOffset({ x: g.base.x + dx, y: g.base.y + dy }, g.base.scale, content, container) });
      }
    }
  };

  const onPointerUp = (e) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1 && g?.type === 'pinch') {
      // 2本指から1本指に戻ったら、残った指で動かし続けられるようにする
      const [rest] = [...pointers.current.values()];
      gesture.current = { type: 'pan', start: rest, base: viewRef.current, moved: true };
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (g?.type === 'pan' && !g.moved) handleTap(e);
  };

  const handleTap = (e) => {
    const now = Date.now();
    const point = relative(e);
    if (lastTap.current && now - lastTap.current.time < DOUBLE_TAP_MS
        && Math.hypot(point.x - lastTap.current.point.x, point.y - lastTap.current.point.y) < 40) {
      clearTimeout(tapTimer.current);
      lastTap.current = null;
      setAnimate(true);
      const current = viewRef.current;
      setView(current.scale > 1.01 ? { scale: 1, x: 0, y: 0 } : zoomAround(current, point, DOUBLE_TAP_SCALE));
      return;
    }
    lastTap.current = { time: now, point };
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      lastTap.current = null;
      onTap?.();
    }, DOUBLE_TAP_MS);
  };

  return html`
    <div
      ref=${box}
      class="zoom-box"
      onPointerDown=${onPointerDown}
      onPointerMove=${onPointerMove}
      onPointerUp=${onPointerUp}
      onPointerCancel=${onPointerUp}
    >
      <img
        ref=${img}
        class=${`zoom-image ${animate ? 'zoom-animate' : ''}`}
        src=${src}
        alt=${alt}
        draggable="false"
        style=${{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      />
    </div>
  `;
}
