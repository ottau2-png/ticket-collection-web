# 教訓（ticket-collection-web）

- `node --test` にディレクトリ（`tests/`）を渡すと Node 25 では失敗扱いになる。`"tests/**/*.test.js"` のようにグロブで渡す
- Service Worker のキャッシュ一覧は手で書くので、ファイルを足したら一覧にも足す（`tests/sw-precache.test.js` が漏れを検出する）。公開するときは `sw.js` の `VERSION` を上げる
- Service Worker でファイルを取り込むときは `new Request(url, { cache: 'reload' })` で HTTP キャッシュを通さない。通すと GitHub Pages の max-age=600 の間、版の番号だけ新しく中身が古いファイルが保存される（実機で「準備中です」の古い画面が出た）
