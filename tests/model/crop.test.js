import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  orderCorners, outputSize, squareToQuad, warpQuad, detectTicketQuad, otsuThreshold, convexHull, largestQuad, defaultQuad,
} from '../../src/model/crop.js';

const close = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} と ${b} の差が ${tol} を超える`);

test('4点を左上・右上・右下・左下に並べる', () => {
  const pts = [{ x: 90, y: 80 }, { x: 10, y: 12 }, { x: 8, y: 75 }, { x: 95, y: 5 }];
  assert.deepEqual(orderCorners(pts), [{ x: 10, y: 12 }, { x: 95, y: 5 }, { x: 90, y: 80 }, { x: 8, y: 75 }]);
});

test('補正後の大きさは向かい合う辺の長い方、上限で縮める', () => {
  const quad = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 280, y: 100 }, { x: 20, y: 110 }];
  const size = outputSize(quad);
  assert.equal(size.width, 300);
  assert.equal(size.height, Math.round(Math.hypot(20, 110)));
  assert.deepEqual(outputSize(quad, 150), { width: 150, height: Math.round(Math.hypot(20, 110) / 2) });
});

test('射影変換は単位正方形の角を四隅に写す', () => {
  const quad = [{ x: 10, y: 20 }, { x: 200, y: 5 }, { x: 220, y: 150 }, { x: 0, y: 130 }];
  const map = squareToQuad(quad);
  for (const [[u, v], p] of [[[0, 0], quad[0]], [[1, 0], quad[1]], [[1, 1], quad[2]], [[0, 1], quad[3]]]) {
    const q = map(u, v);
    close(q.x, p.x, 1e-6, `x(${u},${v})`);
    close(q.y, p.y, 1e-6, `y(${u},${v})`);
  }
});

/** 合成画像：背景（ざらつきあり）の上に、回転した明るい長方形（半券） */
function syntheticPhoto({ width, height, corners, ticket = [245, 240, 228], background = [90, 70, 55], noise = 18, seed = 1 }) {
  const data = new Uint8ClampedArray(width * height * 4);
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const inside = (x, y) => {
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
    }
    return true;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const color = inside(x + 0.5, y + 0.5) ? ticket : background;
      const n = (rand() - 0.5) * noise;
      data[i] = color[0] + n;
      data[i + 1] = color[1] + n;
      data[i + 2] = color[2] + n;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

const rotatedRect = (cx, cy, w, h, degrees) => {
  const t = (degrees * Math.PI) / 180;
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => ({
    x: cx + x * Math.cos(t) - y * Math.sin(t),
    y: cy + x * Math.sin(t) + y * Math.cos(t),
  }));
};

const assertQuadNear = (found, expected, size, tolPx) => {
  assert.ok(found, '四隅が見つからない');
  found.forEach((p, i) => {
    close(p.x * size.width, expected[i].x, tolPx, `角${i} x`);
    close(p.y * size.height, expected[i].y, tolPx, `角${i} y`);
  });
};

for (const degrees of [0, 8, -15, 30]) {
  test(`机の上の半券の四隅を見つける（${degrees}度傾き）`, () => {
    const size = { width: 360, height: 270 };
    const corners = rotatedRect(180, 135, 230, 110, degrees);
    const photo = syntheticPhoto({ ...size, corners });
    assertQuadNear(detectTicketQuad(photo), corners, size, 4);
  });
}

test('斜めから撮った（台形にゆがんだ）半券の四隅を見つける', () => {
  const size = { width: 360, height: 270 };
  const corners = [{ x: 70, y: 60 }, { x: 290, y: 50 }, { x: 320, y: 220 }, { x: 40, y: 210 }];
  assertQuadNear(detectTicketQuad(syntheticPhoto({ ...size, corners })), corners, size, 4);
});

test('白い机に白っぽい半券でも、少しでも色が違えば見つける', () => {
  const size = { width: 360, height: 270 };
  const corners = rotatedRect(180, 135, 240, 120, 5);
  const photo = syntheticPhoto({ ...size, corners, ticket: [238, 232, 215], background: [205, 205, 208], noise: 8 });
  assertQuadNear(detectTicketQuad(photo), corners, size, 5);
});

test('半券に暗い帯があっても、帯を含めた四隅を見つける', () => {
  const size = { width: 360, height: 270 };
  const corners = rotatedRect(180, 135, 230, 110, -4);
  const photo = syntheticPhoto({ ...size, corners, background: [92, 63, 44] });
  // 半券の上 1/4 を暗い青の帯にする（背景の茶色との差は明るい部分よりずっと小さい）
  const [tl, tr] = corners;
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      const i = (y * size.width + x) * 4;
      if (photo.data[i] < 200) continue;
      // 上の辺からの距離が 27px 以内なら帯
      const d = Math.abs((tr.x - tl.x) * (y - tl.y) - (tr.y - tl.y) * (x - tl.x)) / Math.hypot(tr.x - tl.x, tr.y - tl.y);
      if (d < 27) [photo.data[i], photo.data[i + 1], photo.data[i + 2]] = [44, 90, 160];
    }
  }
  assertQuadNear(detectTicketQuad(photo), corners, size, 4);
});

test('背景しかない写真では見つからない（null）', () => {
  const photo = syntheticPhoto({ width: 200, height: 150, corners: [{ x: -1, y: -1 }, { x: -1, y: -1 }, { x: -1, y: -1 }, { x: -1, y: -1 }] });
  assert.equal(detectTicketQuad(photo), null);
});

test('半券が写真いっぱいで縁が見えないときは見つからない（null）', () => {
  const photo = syntheticPhoto({ width: 200, height: 150, corners: [{ x: -5, y: -5 }, { x: 205, y: -5 }, { x: 205, y: 155 }, { x: -5, y: 155 }] });
  assert.equal(detectTicketQuad(photo), null);
});

test('補正：傾いた半券を長方形に直すと、角まで半券の色になる', () => {
  const size = { width: 360, height: 270 };
  const corners = rotatedRect(180, 135, 230, 110, 20);
  const photo = syntheticPhoto({ ...size, corners, noise: 0 });
  const out = warpQuad(photo, corners);
  assert.deepEqual([out.width, out.height], [230, 110]);
  // 内側に2px入った四隅と中央が、背景（90,70,55）ではなく半券（245,240,228）の色
  for (const [x, y] of [[2, 2], [227, 2], [227, 107], [2, 107], [115, 55]]) {
    const i = (y * out.width + x) * 4;
    assert.ok(out.data[i] > 200, `(${x},${y}) が半券の色でない：${out.data[i]}`);
  }
});

test('大津の方法：2つの山の間で分ける', () => {
  const histogram = new Array(256).fill(0);
  histogram[20] = 100;
  histogram[200] = 100;
  const t = otsuThreshold(histogram);
  assert.ok(t >= 20 && t < 200, String(t));
});

test('凸包と最大の四角形', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }, { x: 5, y: 0 }, { x: 10, y: 4 }];
  const hull = convexHull(pts);
  assert.equal(hull.length, 4);
  assert.deepEqual(orderCorners(largestQuad(hull)), [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
});

test('見つからないときの四隅は少し内側の長方形', () => {
  assert.deepEqual(defaultQuad(0.1)[0], { x: 0.1, y: 0.1 });
});
