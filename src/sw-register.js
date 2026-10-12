// Service Worker の登録と、新しい版の反映。
// 新しい版が待機状態になったら onUpdate を呼ぶ。applyUpdate() で切り替えて再読み込みする。

let waiting = null;
// 「更新する」を押したときだけ再読み込みする。初回のインストールでも controllerchange が起きるので、
// 条件なしで再読み込みすると、初めて開いた直後に入力中の画面が消える
let updateRequested = false;

export async function registerServiceWorker(swUrl, { onUpdate } = {}) {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.register(swUrl);

  const watch = (worker) => {
    worker.addEventListener('statechange', () => {
      // 既に別の版が動いているときだけ「更新あり」。初回のインストールでは知らせない
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        waiting = worker;
        onUpdate?.();
      }
    });
  };
  if (reg.waiting && navigator.serviceWorker.controller) {
    waiting = reg.waiting;
    onUpdate?.();
  }
  if (reg.installing) watch(reg.installing);
  reg.addEventListener('updatefound', () => watch(reg.installing));

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !updateRequested) return;
    reloading = true;
    location.reload();
  });

  // ホーム画面のアプリは開きっぱなしになりがちなので、前面に戻るたびに更新を確かめる
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });
  return reg;
}

export function applyUpdate() {
  updateRequested = true;
  waiting?.postMessage('skipWaiting');
}

export function serviceWorkerVersion() {
  return new Promise((resolve) => {
    const ctrl = navigator.serviceWorker?.controller;
    if (!ctrl) return resolve(null);
    const onMessage = (e) => {
      if (e.data?.version) {
        navigator.serviceWorker.removeEventListener('message', onMessage);
        resolve(e.data.version);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    ctrl.postMessage('version');
    setTimeout(() => resolve(null), 2000);
  });
}
