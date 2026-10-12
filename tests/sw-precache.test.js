// Service Worker のキャッシュ一覧に、アプリのファイルの漏れ・存在しないファイルがないか確かめる。
// 漏れがあるとオフラインで開けず、存在しないファイルがあるとインストール自体が失敗する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const listed = JSON.parse(
  sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'),
);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [relative(root, p)];
  });
}

test('アプリのファイルがすべてキャッシュ一覧にある', () => {
  const appFiles = [
    'index.html',
    'manifest.webmanifest',
    ...walk(join(root, 'src')),
    ...walk(join(root, 'icons')),
    ...walk(join(root, 'vendor')).filter((f) => f.endsWith('.js')),
  ];
  const missing = appFiles.filter((f) => !listed.includes(f));
  assert.deepEqual(missing, []);
});

test('キャッシュ一覧のファイルがすべて存在する', () => {
  const absent = listed.filter((f) => f !== './' && !existsSync(join(root, f)));
  assert.deepEqual(absent, []);
});

test('manifest のアイコンが存在する', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) assert.ok(existsSync(join(root, icon.src)), icon.src);
});

test('インストール時は HTTP キャッシュを通さずに取り直す', () => {
  // 通すと、版の番号だけ新しく中身が古いファイルを取り込む（2026-10-12 に実機で発生）
  assert.match(sw, /cache:\s*'reload'/);
});
