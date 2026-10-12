// バックアップの書き出し・読み込み（画像の Base64 変換・サムネイルの作り直しなど、ブラウザでしかできない部分）。
import { backupHeader, toBackupTicket, validateBackup } from './model/backup.js';
import { resizeToJpeg, THUMBNAIL_MAX_SIDE } from './image.js';

const BATCH = 20;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

/** 今日の日付入りのファイル名 */
export function backupFileName(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `ticket-backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`;
}

/**
 * 全データをバックアップのファイルにする。1つの大きな文字列を作らず、半券ごとの部品をつないで Blob にする。
 * @param includeSources 切り抜く前の写真も入れる（ファイルはおよそ倍になる）
 */
export async function exportBackupFile(store, { includeSources = true, onProgress } = {}) {
  const { tickets, performers } = await store.loadAll();
  const header = backupHeader();
  const parts = [`{"format":${JSON.stringify(header.format)},"version":${header.version},"exportedAt":${JSON.stringify(header.exportedAt)},"app":"web",`];
  parts.push(`"performers":${JSON.stringify(performers)},"tickets":[`);
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    const original = t.hasImage ? await store.getOriginal(t.id) : null;
    const source = t.hasImage && includeSources ? await store.getSource(t.id) : null;
    const entry = toBackupTicket(t, {
      image: original ? await blobToBase64(original) : null,
      sourceImage: source ? await blobToBase64(source) : null,
    });
    parts.push((i ? ',' : '') + JSON.stringify(entry));
    onProgress?.(i + 1, tickets.length);
  }
  parts.push(']}');
  return new File(parts, backupFileName(), { type: 'application/json' });
}

/** ファイルを読んで確かめる。@returns { backup, errors } */
export async function readBackupFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return { backup: null, errors: ['ファイルを読めませんでした（JSON ではありません）'] };
  }
  return validateBackup(data);
}

/**
 * 読み込みの計画（planImport の結果）を書き込む。20枚ずつに分けて書くので、途中で失敗しても
 * それまでの分は残る（同じ id は上書きなので、読み込み直せば続きから揃う）。
 */
export async function runImport(store, plan, { onProgress } = {}) {
  const { tickets } = plan;
  if (tickets.length === 0) {
    await store.importBatch({ performers: plan.performers, last: true });
    return;
  }
  for (let start = 0; start < tickets.length; start += BATCH) {
    const chunk = tickets.slice(start, start + BATCH);
    const items = [];
    for (const t of chunk) {
      const { image, sourceImage, ...rest } = t;
      let images = null;
      if (image) {
        const original = base64ToBlob(image);
        const { blob: thumbnail } = await resizeToJpeg(original, THUMBNAIL_MAX_SIDE);
        images = { original, thumbnail, source: sourceImage ? base64ToBlob(sourceImage) : null };
      }
      items.push({ ticket: { ...rest, hasImage: !!images }, images });
    }
    await store.importBatch({
      performers: start === 0 ? plan.performers : [],
      items,
      last: start + BATCH >= tickets.length,
    });
    onProgress?.(Math.min(start + BATCH, tickets.length), tickets.length);
  }
}
