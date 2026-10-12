// めくる画面の並び。ギャラリーで今見えている並び（表示方法・検索を反映）を一覧が覚えておき、めくる画面が使う。
let order = null;

export function setViewerOrder(ids) {
  order = ids;
}

/** 一覧を通らずに開いた（再読み込みなど）ときは null */
export function getViewerOrder() {
  return order;
}
