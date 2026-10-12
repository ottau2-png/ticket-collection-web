// 画像の縮小。撮影・選んだ画像は取り込むときに一度だけ縮小し、以後は縮小済みの JPEG を使う。

export const ORIGINAL_MAX_SIDE = 2000;
export const THUMBNAIL_MAX_SIDE = 600;
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
