// Phase 0 の実機確認。Web で本当にできるかが怪しい所を、作り込む前に iPhone で確かめる。
// アプリ本体とは別のデータベース（ticket-web-check）を使う。
import { makeTicketImages } from '../src/image.js';
import { openDatabase, requestResult, transactionDone } from '../src/store/idb.js';
import { serviceWorkerVersion } from '../src/sw-register.js';

const $ = (id) => document.getElementById(id);
const results = {};

function setResult(key, ok, detail) {
  results[key] = { ok, detail };
  const el = $(`${key}-status`);
  if (el) {
    el.textContent = `${ok ? '成功' : '失敗'}：${detail}`;
    el.className = `status ${ok ? 'ok' : 'ng'}`;
  }
  renderSummary();
}

function renderSummary() {
  const lines = Object.entries(results).map(([k, r]) => `${k}: ${r.ok ? 'OK' : 'NG'} ${r.detail}`);
  $('summary-out').textContent = [$('env-out').textContent, '', ...lines].join('\n');
}

const kb = (n) => `${Math.round(n / 1024)}KB`;
const errorText = (e) => `${e?.name ?? 'Error'}: ${e?.message ?? e}`;

// ---- データベース ----
const dbPromise = openDatabase('ticket-web-check', 1, (db) => {
  db.createObjectStore('images');
});

async function saveImages(entry) {
  const db = await dbPromise;
  const tx = db.transaction('images', 'readwrite');
  tx.objectStore('images').put(entry, 'latest');
  await transactionDone(tx);
}

async function loadImages() {
  const db = await dbPromise;
  return requestResult(db.transaction('images').objectStore('images').get('latest'));
}

function showImages(container, entry) {
  container.replaceChildren(
    ...[entry.original, entry.thumbnail].map((blob) => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(blob);
      return img;
    }),
  );
}

// ---- 1. 環境 ----
async function showEnv() {
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const persisted = await navigator.storage?.persisted?.().catch(() => null);
  const swVersion = await serviceWorkerVersion().catch(() => null);
  $('env-out').textContent = [
    `ホーム画面から起動：${standalone ? 'はい' : 'いいえ'}`,
    `UA：${navigator.userAgent}`,
    `Service Worker：${swVersion ?? 'なし'}`,
    `保存容量：使用 ${est ? kb(est.usage) : '?'} ／ 上限 ${est ? `${Math.round(est.quota / 1024 / 1024)}MB` : '?'}`,
    `データの保護（persisted）：${persisted}`,
    `共有（navigator.share）：${'share' in navigator}`,
    `ファイル共有（canShare files）：${testCanShareFiles()}`,
  ].join('\n');
  renderSummary();
}

function testCanShareFiles() {
  try {
    const f = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'test.jpg', { type: 'image/jpeg' });
    return navigator.canShare?.({ files: [f] }) ?? false;
  } catch {
    return false;
  }
}

$('persist').onclick = async () => {
  try {
    const granted = await navigator.storage.persist();
    setResult('env', granted, `persist() → ${granted}`);
  } catch (e) {
    setResult('env', false, errorText(e));
  }
  showEnv();
};

// ---- 2. 画像 ----
async function onPick(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  $('image-status').textContent = '処理中…';
  try {
    const started = performance.now();
    const { original, thumbnail } = await makeTicketImages(file);
    const ms = Math.round(performance.now() - started);
    const entry = { original: original.blob, thumbnail: thumbnail.blob, savedAt: new Date().toISOString(), sourceType: file.type };
    await saveImages(entry);
    $('image-out').textContent = [
      `元のファイル：${file.type || '種類不明'} ${kb(file.size)}`,
      `元画像：${original.width}×${original.height} ${kb(original.blob.size)}`,
      `サムネイル：${thumbnail.width}×${thumbnail.height} ${kb(thumbnail.blob.size)}`,
      `縮小にかかった時間：${ms}ms`,
    ].join('\n');
    showImages($('image-preview'), entry);
    setResult('image', true, `${original.width}×${original.height} / ${ms}ms。向きが正しいか目で確認`);
  } catch (err) {
    setResult('image', false, errorText(err));
  }
}
$('pick').onchange = onPick;
$('camera').onchange = onPick;

// ---- 3. 再起動後 ----
async function showSaved() {
  try {
    const entry = await loadImages();
    if (!entry) {
      $('restore-status').textContent = 'まだ保存されていません（2 を先に）';
      return;
    }
    $('restore-out').textContent = `保存日時：${new Date(entry.savedAt).toLocaleString('ja-JP')}\n元画像 ${kb(entry.original.size)} ／ サムネイル ${kb(entry.thumbnail.size)}`;
    showImages($('restore-preview'), entry);
    setResult('restore', true, `保存日時 ${entry.savedAt} の画像を読めた`);
  } catch (e) {
    setResult('restore', false, errorText(e));
  }
}
$('reload-saved').onclick = showSaved;

// ---- 4. 共有 ----
$('share-image').onclick = async () => {
  try {
    const entry = await loadImages();
    if (!entry) throw new Error('先に 2 で画像を保存してください');
    const file = new File([entry.original], 'ticket.jpg', { type: 'image/jpeg' });
    if (!navigator.canShare?.({ files: [file] })) throw new Error('canShare が false');
    await navigator.share({ files: [file] });
    setResult('share', true, '共有メニューが開き、送信まで完了（AI アプリで画像が見えたかも確認）');
  } catch (e) {
    // キャンセルは AbortError
    setResult('share', e?.name === 'AbortError', e?.name === 'AbortError' ? '共有メニューは開いた（キャンセル）' : errorText(e));
  }
};

// ---- 5. 貼り付け ----
$('paste-area').addEventListener('input', (e) => {
  const text = e.target.value;
  const fields = text.split(/\r?\n/).filter((l) => /^[^:：]{1,10}[:：]/.test(l.replace(/^[\s\-*•・]+/, '').replace(/\*\*/g, ''))).length;
  setResult('paste', text.length > 0, `${text.length}文字・${text.split(/\r?\n/).length}行・項目らしい行 ${fields}`);
});

// ---- 6. 書き出し ----
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function makeBackupFile() {
  const entry = await loadImages();
  if (!entry) throw new Error('先に 2 で画像を保存してください');
  const data = {
    format: 'ticket-collection-backup-check',
    version: 1,
    exportedAt: new Date().toISOString(),
    tickets: [{ id: 'check-1', title: '確認用の半券', image: await blobToBase64(entry.original) }],
  };
  const json = JSON.stringify(data);
  const stamp = new Date().toISOString().slice(0, 10);
  return new File([json], `ticket-backup-check-${stamp}.json`, { type: 'application/json' });
}

$('export-share').onclick = async () => {
  try {
    const file = await makeBackupFile();
    if (!navigator.canShare?.({ files: [file] })) throw new Error('JSON ファイルは canShare が false');
    await navigator.share({ files: [file] });
    setResult('export', true, `共有メニューで ${kb(file.size)} を渡した（「ファイルに保存」できたか確認）`);
  } catch (e) {
    setResult('export', e?.name === 'AbortError', e?.name === 'AbortError' ? '共有メニューは開いた（キャンセル）' : errorText(e));
  }
};

$('export-download').onclick = async () => {
  try {
    const file = await makeBackupFile();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    $('export-out').textContent = `ダウンロードを開始：${file.name}（${kb(file.size)}）`;
    setResult('export-download', true, '開始した（実際に保存できたか確認）');
  } catch (e) {
    setResult('export-download', false, errorText(e));
  }
};

// ---- 7. 読み込み ----
$('import-file').onchange = async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const ticket = data.tickets?.[0];
    if (!ticket?.image) throw new Error('画像が入っていません');
    const blob = await (await fetch(`data:image/jpeg;base64,${ticket.image}`)).blob();
    const bitmap = await createImageBitmap(blob);
    $('import-out').textContent = `${file.name}（${kb(file.size)}）\n件数：${data.tickets.length}\n画像：${bitmap.width}×${bitmap.height}`;
    bitmap.close();
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blob);
    $('import-preview').replaceChildren(img);
    setResult('import', true, `${data.tickets.length}件・画像を復元できた`);
  } catch (err) {
    setResult('import', false, errorText(err));
  }
};

// ---- 結果 ----
$('copy-results').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('summary-out').textContent);
    $('copy-status').textContent = 'コピーしました';
  } catch (e) {
    $('copy-status').textContent = `コピーできません（${errorText(e)}）。下の文字を長押しで選んでください`;
  }
};

showEnv();
showSaved();
