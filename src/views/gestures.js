// 一覧の操作：行の左スワイプで削除ボタンを出す、タイルの長押し。
import { useRef, useState } from 'preact/hooks';

const DELETE_WIDTH = 88;
const MOVE_THRESHOLD = 8;

// 開いている行は1つだけ。別の行を触ったら閉じる
let closeOpenRow = null;

/**
 * 左スワイプで右端のボタンを出す。
 * @returns { offset, handlers, close, consumeClick } handlers を行に付け、offset で中身をずらす
 */
export function useSwipeToReveal() {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef(null);
  const suppressClick = useRef(false);

  const close = () => setOffset(0);

  const handlers = {
    onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (closeOpenRow && closeOpenRow !== close) {
        closeOpenRow();
        closeOpenRow = null;
      }
      gesture.current = { x: e.clientX, y: e.clientY, base: offset, axis: null, id: e.pointerId };
    },
    onPointerMove(e) {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.axis) {
        if (Math.abs(dx) < MOVE_THRESHOLD && Math.abs(dy) < MOVE_THRESHOLD) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (g.axis === 'x') {
          try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* 指がもう離れている */ }
          setDragging(true);
        }
      }
      if (g.axis === 'x') setOffset(Math.max(-DELETE_WIDTH * 1.3, Math.min(0, g.base + dx)));
    },
    onPointerUp(e) {
      const g = gesture.current;
      gesture.current = null;
      if (!g || g.axis !== 'x') return;
      setDragging(false);
      suppressClick.current = true;
      const open = g.base + (e.clientX - g.x) < -DELETE_WIDTH / 2;
      setOffset(open ? -DELETE_WIDTH : 0);
      closeOpenRow = open ? close : null;
    },
    onPointerCancel() {
      gesture.current = null;
      setDragging(false);
      setOffset((o) => (o < -DELETE_WIDTH / 2 ? -DELETE_WIDTH : 0));
    },
  };

  /** スワイプの直後や開いた状態でのタップは、行を開く操作として扱わない */
  const consumeClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return true;
    }
    if (offset !== 0) {
      close();
      return true;
    }
    return false;
  };

  return { offset, dragging, handlers, close, consumeClick, deleteWidth: DELETE_WIDTH };
}

/** 長押し（指を動かさずに約0.5秒）。長押しが起きたらその後のタップは無視する */
export function useLongPress(onLongPress, delay = 500) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);

  const cancel = () => {
    clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    handlers: {
      onPointerDown(e) {
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        cancel();
        timer.current = setTimeout(() => {
          fired.current = true;
          navigator.vibrate?.(10);
          onLongPress();
        }, delay);
      },
      onPointerMove(e) {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onContextMenu(e) {
        e.preventDefault();
      },
    },
    consumeClick() {
      if (fired.current) {
        fired.current = false;
        return true;
      }
      return false;
    },
  };
}
