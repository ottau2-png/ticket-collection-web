// 画面遷移はハッシュ（#/ticket/<id> など）で行う。GitHub Pages で追加設定なしに動き、戻る操作も効く。
import { useEffect, useState } from 'preact/hooks';

/** '#/ticket/abc' → { name: 'ticket', params: ['abc'] }。空なら一覧 */
export function parseHash(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] ?? 'list', params: parts.slice(1) };
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function href(...parts) {
  return `#/${parts.map((p) => encodeURIComponent(p)).join('/')}`;
}

export function navigate(...parts) {
  location.hash = href(...parts);
}

/** 前の画面に戻る。直接開いたなどで戻り先がなければ一覧へ */
export function goBack() {
  if (history.length > 1) history.back();
  else location.hash = '#/';
}
