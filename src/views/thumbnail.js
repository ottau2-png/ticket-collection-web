// サムネイルの表示。Blob から作った URL は半券の更新日ごとに使い回し、描画のたびに読み直さない。
import { useEffect, useState } from 'preact/hooks';
import { html } from '../html.js';
import { categoryIcon } from '../format.js';
import { useData } from '../data.js';

// 半券の id → { version, url }
const cache = new Map();

async function thumbnailUrl(store, ticket) {
  const hit = cache.get(ticket.id);
  if (hit?.version === ticket.updatedAt) return hit.url;
  if (hit) URL.revokeObjectURL(hit.url);
  const blob = await store.getThumbnail(ticket.id);
  if (!blob) {
    cache.delete(ticket.id);
    return null;
  }
  const url = URL.createObjectURL(blob);
  cache.set(ticket.id, { version: ticket.updatedAt, url });
  return url;
}

/** 消えた半券の URL を手放す */
export function releaseThumbnails(existingIds) {
  for (const [id, { url }] of cache) {
    if (!existingIds.has(id)) {
      URL.revokeObjectURL(url);
      cache.delete(id);
    }
  }
}

export function Thumbnail({ ticket, className = '' }) {
  const { store } = useData();
  const cached = cache.get(ticket.id);
  const [url, setUrl] = useState(cached?.version === ticket.updatedAt ? cached.url : null);

  useEffect(() => {
    if (!ticket.hasImage || !store) {
      setUrl(null);
      return;
    }
    let alive = true;
    thumbnailUrl(store, ticket).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [store, ticket.id, ticket.updatedAt, ticket.hasImage]);

  if (ticket.hasImage && url) {
    return html`<img class=${`thumb ${className}`} src=${url} alt="" draggable="false" />`;
  }
  return html`<div class=${`thumb thumb-empty ${className}`} aria-hidden="true">${categoryIcon(ticket.category)}</div>`;
}
