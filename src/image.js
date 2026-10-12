// 画像の縮小と切り抜き。撮影・選んだ画像は取り込むときに一度だけ縮小し、以後は縮小済みの JPEG を使う。
import { detectTicketQuad, outputSize, warpQuad } from './model/crop.js';

export const ORIGINAL_MAX_SIDE = 2000;
export const THUMBNAIL_MAX_SIDE = 600;
const DETECT_MAX_SIDE = 360;
const JPEG_QUALITY = 0.85;

/** 長辺が maxSide に収まる大きさ（拡大はしない） */
export function fitSize(width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** 画像ファイル（Blob）を、長辺 maxSide の JPEG に縮小する。向き（EXIF）は反映済みになる */
export async function resizeToJpeg(source, maxSide) {
  const bitmap = source instanceof ImageBitmap ? source : await createImageBitmap(source);
  const { width, height } = fitSize(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を変換できませんでした'))), 'image/jpeg', JPEG_QUALITY));
  // iOS の canvas はメモリを使い続けることがあるので、大きさを 0 にして手放す
  canvas.width = canvas.height = 0;
  return { blob, width, height };
}

/** 取り込み用：元画像（長辺2000px）とサムネイル（長辺600px）を作る */
export async function makeTicketImages(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const original = await resizeToJpeg(bitmap, ORIGINAL_MAX_SIDE);
    const thumbnail = await resizeToJpeg(bitmap, THUMBNAIL_MAX_SIDE);
    return { original, thumbnail };
  } finally {
    bitmap.close();
  }
}

/** 画像を canvas に描いて画素を読む（長辺 maxSide まで縮小） */
async function readPixels(blob, maxSide) {
  const bitmap = await createImageBitmap(blob);
  try {
    const { width, height } = fitSize(bitmap.width, bitmap.height, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    canvas.width = canvas.height = 0;
    return image;
  } finally {
    bitmap.close();
  }
}

/** 写真から半券の四隅を推定する。見つからなければ null（推定できなくても、手で合わせれば切り抜ける） */
export async function detectQuad(blob) {
  try {
    return detectTicketQuad(await readPixels(blob, DETECT_MAX_SIDE));
  } catch {
    return null;
  }
}

/** 撮影・選んだ写真を、切り抜く前の写真（長辺2000px）にし、半券の四隅を推定する */
export async function prepareSource(file) {
  const { blob: source } = await resizeToJpeg(file, ORIGINAL_MAX_SIDE);
  return { source, quad: await detectQuad(source) };
}

/**
 * 切り抜く前の写真から、四隅（0〜1）の内側を長方形に直して切り抜く。
 * @returns { original, thumbnail }（どちらも JPEG の Blob）
 */
export async function cropTicketImage(source, quad) {
  const pixels = await readPixels(source, ORIGINAL_MAX_SIDE);
  const corners = quad.map((p) => ({ x: p.x * pixels.width, y: p.y * pixels.height }));
  const warped = warpQuad(pixels, corners, outputSize(corners, ORIGINAL_MAX_SIDE));
  const canvas = document.createElement('canvas');
  canvas.width = warped.width;
  canvas.height = warped.height;
  canvas.getContext('2d').putImageData(new ImageData(warped.data, warped.width, warped.height), 0, 0);
  const original = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を変換できませんでした'))), 'image/jpeg', JPEG_QUALITY));
  canvas.width = canvas.height = 0;
  const { blob: thumbnail } = await resizeToJpeg(original, THUMBNAIL_MAX_SIDE);
  return { original, thumbnail };
}
