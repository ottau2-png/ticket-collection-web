// 半券の切り抜き：四隅の自動推定と、四隅を長方形に直す補正（射影変換）。
// 画像は { width, height, data: RGBA の配列 }（ImageData と同じ形）で受け取るので、Node でもテストできる。
// 四隅は { x, y } の配列で、順番は左上・右上・右下・左下。

/** 4点を左上・右上・右下・左下の順に並べる（重心から見た角度順、左上は x + y が最小の点） */
export function orderCorners(points) {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const byAngle = [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // 画面の座標は y が下向きなので、角度順は時計回り（左上→右上→右下→左下）
  const start = byAngle.reduce((best, p, i) => (p.x + p.y < byAngle[best].x + byAngle[best].y ? i : best), 0);
  return [...byAngle.slice(start), ...byAngle.slice(0, start)];
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** 補正後の大きさ：向かい合う辺の長い方。長辺が maxSide を超えるなら縮める */
export function outputSize(quad, maxSide = Infinity) {
  const [tl, tr, br, bl] = quad;
  const width = Math.max(distance(tl, tr), distance(bl, br));
  const height = Math.max(distance(tl, bl), distance(tr, br));
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * 単位正方形 (u, v) ∈ [0,1]² を四角形 quad に写す射影変換（Heckbert の式）。
 * (0,0)→左上、(1,0)→右上、(1,1)→右下、(0,1)→左下。
 */
export function squareToQuad(quad) {
  const [{ x: x0, y: y0 }, { x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }] = quad;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  let a, b, c, d, e, f, g, h;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    // 平行四辺形（遠近のゆがみなし）
    [a, b, c, d, e, f, g, h] = [x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0];
  } else {
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;
    a = x1 - x0 + g * x1;
    b = x3 - x0 + h * x3;
    c = x0;
    d = y1 - y0 + g * y1;
    e = y3 - y0 + h * y3;
    f = y0;
  }
  return (u, v) => {
    const w = g * u + h * v + 1;
    return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
  };
}

/**
 * 四角形 quad の中身を長方形に直した画像を作る（双線形補間）。
 * @param source { width, height, data }
 * @returns { width, height, data: Uint8ClampedArray }
 */
export function warpQuad(source, quad, size = outputSize(quad)) {
  const { width: W, height: H } = size;
  const map = squareToQuad(quad);
  const out = new Uint8ClampedArray(W * H * 4);
  const src = source.data;
  const sw = source.width;
  const sh = source.height;
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / H;
    for (let i = 0; i < W; i++) {
      const p = map((i + 0.5) / W, v);
      // 画素の中心を合わせる
      const x = Math.min(sw - 1, Math.max(0, p.x - 0.5));
      const y = Math.min(sh - 1, Math.max(0, p.y - 0.5));
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const fx = x - x0, fy = y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      const o = (j * W + i) * 4;
      for (let k = 0; k < 4; k++) {
        const top = src[i00 + k] + (src[i10 + k] - src[i00 + k]) * fx;
        const bottom = src[i01 + k] + (src[i11 + k] - src[i01 + k]) * fx;
        out[o + k] = top + (bottom - top) * fy;
      }
    }
  }
  return { width: W, height: H, data: out };
}

// ---- 四隅の自動推定 ----

/** 推定できなかったときの四隅：少し内側の長方形（0〜1） */
export function defaultQuad(inset = 0.06) {
  return [
    { x: inset, y: inset },
    { x: 1 - inset, y: inset },
    { x: 1 - inset, y: 1 - inset },
    { x: inset, y: 1 - inset },
  ];
}

export function fullQuad() {
  return defaultQuad(0);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** 大津の方法：ヒストグラムを2つに分けるしきい値 */
export function otsuThreshold(histogram) {
  const total = histogram.reduce((s, n) => s + n, 0);
  let sumAll = 0;
  for (let i = 0; i < histogram.length; i++) sumAll += i * histogram[i];
  let sumBack = 0, weightBack = 0, best = 0, bestVariance = -1;
  for (let t = 0; t < histogram.length; t++) {
    weightBack += histogram[t];
    if (weightBack === 0) continue;
    const weightFore = total - weightBack;
    if (weightFore === 0) break;
    sumBack += t * histogram[t];
    const meanBack = sumBack / weightBack;
    const meanFore = (sumAll - sumBack) / weightFore;
    const variance = weightBack * weightFore * (meanBack - meanFore) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  return best;
}

/** 凸包（Andrew の方法）。点は { x, y } */
export function convexHull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const polygonArea = (pts) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
};

/** 凸包の頂点から、面積が最大に近い四角形を選ぶ（端の4点から始め、1点ずつ入れ替えて広げる） */
export function largestQuad(hull) {
  if (hull.length <= 4) return hull;
  const extreme = (score) => hull.reduce((best, p, i) => (score(p) < score(hull[best]) ? i : best), 0);
  let idx = [
    extreme((p) => p.x + p.y),
    extreme((p) => -(p.x - p.y)),
    extreme((p) => -(p.x + p.y)),
    extreme((p) => p.x - p.y),
  ];
  idx = [...new Set(idx)];
  while (idx.length < 4) {
    const next = hull.findIndex((_, i) => !idx.includes(i));
    idx.push(next);
  }
  idx.sort((a, b) => a - b);
  let area = polygonArea(idx.map((i) => hull[i]));
  for (let round = 0; round < 10; round++) {
    let improved = false;
    for (let k = 0; k < 4; k++) {
      for (let cand = 0; cand < hull.length; cand++) {
        if (idx.includes(cand)) continue;
        const trial = [...idx];
        trial[k] = cand;
        trial.sort((a, b) => a - b);
        const a = polygonArea(trial.map((i) => hull[i]));
        if (a > area + 1e-9) {
          area = a;
          idx = trial;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return idx.map((i) => hull[i]);
}

/**
 * 写真から半券の四隅を推定する。縁の色を背景とみなし、背景と色の違う一番大きな塊を半券とする。
 * @param image 縮小した画像 { width, height, data }（長辺 300〜400px 程度）
 * @returns 0〜1 の四隅（左上・右上・右下・左下）。見つからなければ null
 */
export function detectTicketQuad(image) {
  const { width: w, height: h, data } = image;
  if (w < 8 || h < 8) return null;

  // 背景の色：縁（幅2px）の中央値
  const border = { r: [], g: [], b: [] };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x > 1 && x < w - 2 && y > 1 && y < h - 2) continue;
      const i = (y * w + x) * 4;
      border.r.push(data[i]);
      border.g.push(data[i + 1]);
      border.b.push(data[i + 2]);
    }
  }
  const bg = { r: median(border.r), g: median(border.g), b: median(border.b) };

  // 背景との色の差（0〜765 を 256 段に）
  const diff = new Uint8Array(w * h);
  const histogram = new Array(256).fill(0);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const d = Math.abs(data[i] - bg.r) + Math.abs(data[i + 1] - bg.g) + Math.abs(data[i + 2] - bg.b);
    const level = Math.min(255, Math.round(d / 3));
    diff[p] = level;
    histogram[level]++;
  }
  // しきい値：背景自体のばらつき（縁の色の差の上位5%）より十分大きい差を「背景でない」とする。
  // 大津の方法だけだと、半券の明るい部分と暗い部分の間で分けてしまい、暗い帯などが背景扱いになる
  const borderDiffs = [];
  for (let k = 0; k < border.r.length; k++) {
    borderDiffs.push(Math.round((Math.abs(border.r[k] - bg.r) + Math.abs(border.g[k] - bg.g) + Math.abs(border.b[k] - bg.b)) / 3));
  }
  borderDiffs.sort((a, b) => a - b);
  const backgroundSpread = borderDiffs[Math.floor(borderDiffs.length * 0.95)];
  const threshold = Math.max(12, Math.min(otsuThreshold(histogram), backgroundSpread * 1.5 + 8));

  // 背景と違う画素の、一番大きな塊（4近傍）
  const mask = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) mask[p] = diff[p] > threshold ? 1 : 0;
  const label = new Int32Array(w * h).fill(-1);
  let best = { size: 0, id: -1 };
  const stack = [];
  let id = 0;
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || label[start] !== -1) continue;
    let size = 0;
    stack.push(start);
    label[start] = id;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % w, y = (p - x) / w;
      const neighbors = [x > 0 && p - 1, x < w - 1 && p + 1, y > 0 && p - w, y < h - 1 && p + w];
      for (const q of neighbors) {
        if (q === false || !mask[q] || label[q] !== -1) continue;
        label[q] = id;
        stack.push(q);
      }
    }
    if (size > best.size) best = { size, id };
    id++;
  }
  const ratio = best.size / (w * h);
  if (ratio < 0.05 || ratio > 0.97) return null;

  // 塊の各行の左端・右端から凸包を作る
  const edge = [];
  for (let y = 0; y < h; y++) {
    let left = -1, right = -1;
    for (let x = 0; x < w; x++) {
      if (label[y * w + x] !== best.id) continue;
      if (left < 0) left = x;
      right = x;
    }
    if (left >= 0) edge.push({ x: left, y }, { x: right + 1, y }, { x: left, y: y + 1 }, { x: right + 1, y: y + 1 });
  }
  const quad = largestQuad(convexHull(edge));
  if (quad.length < 4) return null;
  // 四角形が塊を十分に覆っていなければ（三角形に近いなど）信用しない
  if (polygonArea(quad) < best.size * 0.85) return null;
  return orderCorners(quad).map((p) => ({ x: p.x / w, y: p.y / h }));
}
