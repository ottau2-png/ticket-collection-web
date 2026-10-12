// 拡大表示の計算（画面に依存しないのでテストできる）。

/** 拡大した画像を container に収めたまま動かせる範囲に、位置を収める */
export function clampOffset({ x, y }, scale, content, container) {
  const maxX = Math.max(0, (content.width * scale - container.width) / 2);
  const maxY = Math.max(0, (content.height * scale - container.height) / 2);
  // + 0 で -0 を 0 にそろえる
  return { x: Math.min(maxX, Math.max(-maxX, x)) + 0, y: Math.min(maxY, Math.max(-maxY, y)) + 0 };
}

/** object-fit: contain で表示したときの画像の大きさ */
export function containSize(natural, container) {
  if (!natural.width || !natural.height) return { width: container.width, height: container.height };
  const ratio = Math.min(container.width / natural.width, container.height / natural.height);
  return { width: natural.width * ratio, height: natural.height * ratio };
}
