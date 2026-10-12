// めくる画面の計算（画面に依存しないのでテストできる）。

/** 指を離したときに表示するページ。幅の 1/4 以上動かすか、速く払えば隣へ（端より先へは行かない） */
export function nextPage({ index, count, dx, width, velocity }) {
  const far = Math.abs(dx) > width * 0.25;
  const fast = Math.abs(velocity) > 0.35 && Math.abs(dx) > 10;
  if (!far && !fast) return index;
  const step = dx < 0 ? 1 : -1;
  return Math.min(count - 1, Math.max(0, index + step));
}

/** 端でさらに引っぱったときは、動きを小さくして「これ以上ない」ことを伝える */
export function dragOffset({ index, count, dx }) {
  const atStart = index === 0 && dx > 0;
  const atEnd = index === count - 1 && dx < 0;
  return atStart || atEnd ? dx * 0.3 : dx;
}
