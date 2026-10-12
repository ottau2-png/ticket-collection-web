// 画面の確認用に、架空の半券をアプリのデータに入れる・消す。
// id が 'sample-' で始まる半券だけを扱い、ユーザーが登録した半券には触らない。
import { TicketStore } from '../src/store/db.js';
import { emptyDraft, ticketFromDraft } from '../src/model/ticket.js';
import { resolvePerformers } from '../src/model/performers.js';
import { makeTicketImages } from '../src/image.js';

const SAMPLES = [
  { title: 'サンプルバンド LIVE TOUR 2026', performers: 'サンプルバンド', category: 'ライブ', date: '2026-09-20', venue: '架空アリーナ', color: '#2c5aa0' },
  { title: 'THE IMAGINARY ORCHESTRA OF THE NORTHERN LIGHTS WORLD TOUR', subtitle: 'JAPAN 2026', performers: 'Imaginary Orchestra', category: 'クラシック', date: '2026-06-02', venue: '架空シンフォニーホール', color: '#5a3d8a' },
  { title: '劇団テスト 冬公演「架空の物語」', performers: '劇団テスト', category: '演劇', date: '2025-12-14', venue: 'テスト劇場', color: '#8a3d3d', portrait: true },
  { title: '対バンナイト Vol.3', performers: 'サンプルバンド、ゲストバンド', category: 'ライブ', date: '2025-08-08', venue: 'ライブハウス架空', color: '#1f7a5c' },
  { title: 'ミュージカル『架空の王国』', performers: '', category: 'ミュージカル', date: '2025-03-21', venue: '架空劇場', color: '#a0702c' },
  { title: 'サンプル寄席 新春', performers: '架空亭一門', category: 'お笑い', date: '2024-01-05', venue: '架空演芸場', color: '#7a5c1f', noImage: true },
  { title: '架空の美術展', performers: '', category: '展示会', date: '2024-05-18', venue: '架空美術館', color: '#3d6e8a', portrait: true },
  { title: 'ゲストバンド ワンマン', performers: 'ゲストバンド', category: '', date: '2023-11-11', venue: '架空ホール', color: '#444444' },
  { title: 'サンプルFC vs テストユナイテッド', performers: '', category: 'スポーツ', date: '2023-04-29', venue: '架空スタジアム', color: '#2c8a3d' },
];

function drawTicket({ title, date, venue, color, portrait }) {
  const canvas = document.createElement('canvas');
  canvas.width = portrait ? 900 : 1600;
  canvas.height = portrait ? 1500 : 700;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f7f2e8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height * 0.18);
  ctx.fillStyle = '#222';
  ctx.font = `bold ${portrait ? 64 : 72}px sans-serif`;
  const words = title.split(' ');
  let line = '';
  let y = canvas.height * 0.32;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > canvas.width * 0.86 && line) {
      ctx.fillText(line, canvas.width * 0.07, y);
      line = w;
      y += 84;
    } else {
      line = next;
    }
  }
  ctx.fillText(line, canvas.width * 0.07, y);
  ctx.font = '48px sans-serif';
  ctx.fillText(`${date.replaceAll('-', '.')}  ${venue}`, canvas.width * 0.07, canvas.height * 0.82);
  ctx.fillText('SAMPLE  000-0000', canvas.width * 0.07, canvas.height * 0.92);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

export async function addSamples() {
  const store = await TicketStore.open();
  try {
    let index = 0;
    for (const s of SAMPLES) {
      const id = `sample-${++index}`;
      const { performers } = await store.loadAll();
      const draft = {
        ...emptyDraft(s.date),
        title: s.title,
        subtitle: s.subtitle ?? '',
        category: s.category,
        performerNames: s.performers,
        venue: s.venue,
        hasStartTime: true,
        startTime: '18:30',
        hasImage: !s.noImage,
      };
      const { ids, created } = resolvePerformers(draft.performerNames, performers);
      const image = s.noImage ? null : await makeTicketImages(await drawTicket(s));
      await store.saveTicket(ticketFromDraft(draft, { id, performerIds: ids }), {
        newPerformers: created,
        image: image ? { original: image.original.blob, thumbnail: image.thumbnail.blob } : null,
      });
    }
    return SAMPLES.length;
  } finally {
    store.db.close();
  }
}

export async function removeSamples() {
  const store = await TicketStore.open();
  try {
    const { tickets } = await store.loadAll();
    const samples = tickets.filter((t) => t.id.startsWith('sample-'));
    for (const t of samples) await store.deleteTicket(t.id);
    return samples.length;
  } finally {
    store.db.close();
  }
}
