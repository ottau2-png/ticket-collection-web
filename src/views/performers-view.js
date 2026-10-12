// 出演者の管理：一覧（枚数・別名）→ 編集（名前・よみ・別名、その出演者の半券）、表記ゆれの統合。
// どの半券にも紐づかない出演者は、半券の保存・削除のときに自動で消える（store/db.js）。
import { useEffect, useMemo, useState } from 'preact/hooks';
import { html } from '../html.js';
import { useData } from '../data.js';
import { comparePerformers, ticketCounts, conflictingPerformer, parseAliases } from '../model/performers.js';
import { normalizeKey } from '../model/text.js';
import { ticketMetaLine } from '../format.js';
import { goBack, href } from '../router.js';
import { TextField, FieldGroup } from './fields.js';
import { Thumbnail } from './thumbnail.js';

export function PerformerListView() {
  const { tickets, performers } = useData();
  const [query, setQuery] = useState('');
  const counts = useMemo(() => ticketCounts(tickets), [tickets]);
  const key = normalizeKey(query);
  const list = useMemo(
    () => [...performers]
      .filter((p) => !key || [p.name, p.reading, ...p.aliases].some((n) => normalizeKey(n).includes(key)))
      .sort(comparePerformers),
    [performers, key],
  );

  return html`
    <div class="screen">
      <header class="nav-bar">
        <button class="nav-back" onClick=${goBack}>‹ 戻る</button>
        <h1>出演者（${performers.length}）</h1>
      </header>
      <main class="content">
        <div class="search plain">
          <input type="search" placeholder="名前・よみ・別名で検索" value=${query} onInput=${(e) => setQuery(e.currentTarget.value)} />
        </div>
        ${performers.length === 0 && html`<div class="empty"><p>出演者はまだいません。半券の「出演者」に入れると、ここに出ます。</p></div>`}
        ${performers.length > 0 && list.length === 0 && html`<div class="empty"><p>「${query}」に一致する出演者はいません。</p></div>`}
        ${list.length > 0 && html`
          <ul class="plain-list">
            ${list.map((p) => html`
              <li key=${p.id}>
                <a class="plain-row" href=${href('performer', p.id)}>
                  <span class="plain-main">
                    <span class="row-title">${p.name}</span>
                    ${(p.reading || p.aliases.length > 0) && html`
                      <span class="row-meta">${[p.reading, p.aliases.length ? `別名：${p.aliases.join('、')}` : ''].filter(Boolean).join('　')}</span>
                    `}
                  </span>
                  <span class="plain-count">${counts.get(p.id) ?? 0}枚</span>
                  <span class="chevron">›</span>
                </a>
              </li>
            `)}
          </ul>
        `}
      </main>
    </div>
  `;
}

export function PerformerEditView({ performerId }) {
  const { tickets, performers, loaded, mutate } = useData();
  const performer = performers.find((p) => p.id === performerId);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [merging, setMerging] = useState(false);

  // 編集欄は開いたときに一度だけ作る（保存で読み直されても入力中の値を消さない）
  useEffect(() => {
    if (form || !performer) return;
    setForm({ name: performer.name, reading: performer.reading, aliases: performer.aliases.join('、') });
  }, [performer]);

  const own = useMemo(
    () => tickets.filter((t) => t.performerIds.includes(performerId)).sort((a, b) => (a.performanceDate < b.performanceDate ? 1 : -1)),
    [tickets, performerId],
  );

  if (!loaded) return null;
  if (!performer) {
    return html`
      <div class="screen">
        <header class="nav-bar"><button class="nav-back" onClick=${goBack}>‹ 戻る</button><h1>出演者</h1></header>
        <main class="content"><div class="empty"><p>この出演者は見つかりません。統合や半券の削除で消えた可能性があります。</p></div></main>
      </div>
    `;
  }
  if (!form) return null;

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const name = form.name.trim();
  const aliases = parseAliases(form.aliases, name);
  const changed = name !== performer.name || form.reading.trim() !== performer.reading || aliases.join('\n') !== performer.aliases.join('\n');

  const save = async () => {
    if (!name || saving) return;
    const other = conflictingPerformer(performers, performer.id, name, aliases);
    if (other) {
      setError(`「${other.name}」と名前・別名が重なっています。同じ人なら「ほかの出演者に統合」を使ってください。`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await mutate((store) => store.savePerformer({ ...performer, name, reading: form.reading.trim(), aliases }));
      goBack();
    } catch (e) {
      setError(`保存できませんでした：${e.message ?? e}`);
      setSaving(false);
    }
  };

  const merge = async (target) => {
    const message = `「${performer.name}」を「${target.name}」に統合しますか？\n\n`
      + `・「${performer.name}」の半券 ${own.length}枚を「${target.name}」に付け替えます\n`
      + `・「${performer.name}」とその別名は「${target.name}」の別名に残します\n`
      + '・この操作は取り消せません';
    if (!confirm(message)) return;
    try {
      await mutate((store) => store.mergePerformers(performer.id, target.id));
      setMerging(false);
      location.replace(href('performer', target.id));
    } catch (e) {
      setError(`統合できませんでした：${e.message ?? e}`);
    }
  };

  return html`
    <div class="screen">
      <header class="nav-bar">
        <button class="nav-side" onClick=${() => (!changed || confirm('変更を破棄しますか？')) && goBack()}>キャンセル</button>
        <h1>出演者を編集</h1>
        <button class="nav-side nav-strong" onClick=${save} disabled=${!name || !changed || saving}>保存</button>
      </header>
      <main class="content form">
        ${error && html`<p class="error">${error}</p>`}
        <${FieldGroup} footer="別名は表記ゆれ（「ミスチル」など）。複数なら「、」で区切る。出演者欄に別名を入れても、この出演者に紐づきます">
          <${TextField} label="名前" value=${form.name} onChange=${set('name')} placeholder="必須" wrap />
          <${TextField} label="よみ" value=${form.reading} onChange=${set('reading')} placeholder="並び替えに使う（ひらがな）" />
          <${TextField} label="別名" value=${form.aliases} onChange=${set('aliases')} wrap />
        <//>

        <section class="field-group">
          <h2 class="group-title">半券（${own.length}）</h2>
          <ul class="plain-list">
            ${own.map((t) => html`
              <li key=${t.id}>
                <a class="plain-row" href=${href('ticket', t.id)}>
                  <${Thumbnail} ticket=${t} className="row-thumb small-thumb" />
                  <span class="plain-main">
                    <span class="row-title">${t.title}</span>
                    <span class="row-meta">${ticketMetaLine(t)}</span>
                  </span>
                  <span class="chevron">›</span>
                </a>
              </li>
            `)}
          </ul>
        </section>

        <button class="button wide" onClick=${() => setMerging(true)} disabled=${performers.length < 2}>ほかの出演者に統合</button>
        <p class="note">同じ人が別の名前で登録されているとき（表記ゆれ）に使います。</p>
      </main>
      ${merging && html`<${MergeSheet} source=${performer} onPick=${merge} onClose=${() => setMerging(false)} />`}
    </div>
  `;
}

/** 統合先を選ぶ */
function MergeSheet({ source, onPick, onClose }) {
  const { tickets, performers } = useData();
  const [query, setQuery] = useState('');
  const counts = useMemo(() => ticketCounts(tickets), [tickets]);
  const key = normalizeKey(query);
  const list = performers
    .filter((p) => p.id !== source.id)
    .filter((p) => !key || [p.name, p.reading, ...p.aliases].some((n) => normalizeKey(n).includes(key)))
    .sort(comparePerformers);

  return html`
    <div class="sheet-backdrop" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-label="統合先を選ぶ">
        <header class="sheet-bar">
          <button class="nav-side" onClick=${onClose}>閉じる</button>
          <h1>統合先を選ぶ</h1>
          <span class="nav-side"></span>
        </header>
        <div class="sheet-body">
          <p class="note">「${source.name}」をまとめる先（残す方の名前）を選んでください。</p>
          <div class="search plain">
            <input type="search" placeholder="名前・よみ・別名で検索" value=${query} onInput=${(e) => setQuery(e.currentTarget.value)} />
          </div>
          <ul class="plain-list">
            ${list.map((p) => html`
              <li key=${p.id}>
                <button class="plain-row" onClick=${() => onPick(p)}>
                  <span class="plain-main">
                    <span class="row-title">${p.name}</span>
                    ${p.aliases.length > 0 && html`<span class="row-meta">別名：${p.aliases.join('、')}</span>`}
                  </span>
                  <span class="plain-count">${counts.get(p.id) ?? 0}枚</span>
                </button>
              </li>
            `)}
          </ul>
          ${list.length === 0 && html`<p class="note">該当する出演者がいません。</p>`}
        </div>
      </div>
    </div>
  `;
}

