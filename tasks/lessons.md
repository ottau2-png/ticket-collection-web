# 教訓（ticket-collection-web）

- `node --test` にディレクトリ（`tests/`）を渡すと Node 25 では失敗扱いになる。`"tests/**/*.test.js"` のようにグロブで渡す
- Service Worker のキャッシュ一覧は手で書くので、ファイルを足したら一覧にも足す（`tests/sw-precache.test.js` が漏れを検出する）。公開するときは `sw.js` の `VERSION` を上げる
