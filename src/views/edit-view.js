// 半券の登録・編集。フォームは下書きを編集し、保存したときだけ書き込む（キャンセルで何も変えない）。
import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from '../html.js';
import { useData } from '../data.js';
import { CATEGORIES } from '../model/category.js';
import {
  emptyDraft, draftFromTicket, canSave, ticketFromDraft, withImage, withoutImage, SEAT_FIELDS, SEAT_LABELS,
} from '../model/ticket.js';
import { resolvePerformers } from '../model/performers.js';
import { makeTicketImages } from '../image.js';
import { goBack } from '../router.js';
import { TextField, SelectField, DateField, OptionalTimeField, FieldGroup } from './fields.js';
import { Thumbnail } from './thumbnail.js';
import { Missing, useObjectUrl } from './common.js';

/** @param ticketId 編集する半券。null なら新規 */
export function EditView({ ticketId }) {
  const { tickets, performers, performersById, loaded, mutate } = useData();
  const existing = ticketId ? tickets.find((t) => t.id === ticketId) : null;

  // 下書きは開いたときに一度だけ作る（保存で一覧が読み直されても、編集中の値を上書きしない）
  const [draft, setDraft] = useState(null);
  const initial = useRef(null);
  useEffect(() => {
    if (draft || !loaded) return;
    if (ticketId && !existing) return;
    const d = existing ? draftFromTicket(existing, performersById) : emptyDraft();
    initial.current = d;
    setDraft(d);
  }, [loaded, existing]);

  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState(null);

  if (loaded && ticketId && !existing && !draft) {
    return html`<${Missing} />`;
  }
  if (!draft) return null;

  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const setSeat = (key) => (value) => setDraft((d) => ({ ...d, seat: { ...d.seat, [key]: value } }));
  const dirty = isDirty(draft, initial.current);

  const cancel = () => {
    if (dirty && !confirm('変更を破棄しますか？')) return;
    goBack();
  };

  const save = async () => {
    if (!canSave(draft) || saving) return;
    setSaving(true);
    setError(null);
    try {
      const id = existing?.id ?? crypto.randomUUID();
      const { ids, created } = resolvePerformers(draft.performerNames, performers);
      const ticket = ticketFromDraft(draft, { id, performerIds: ids, existing });
      const image = draft.imageChanged ? draft.image : undefined;
      await mutate((store) => store.saveTicket(ticket, { newPerformers: created, image }));
      if (existing) goBack();
      else location.replace(`#/ticket/${encodeURIComponent(id)}`);
    } catch (e) {
      setError(`保存できませんでした：${e.message ?? e}`);
      setSaving(false);
    }
  };

  const pickImage = async (file) => {
    if (!file) return;
    setImageBusy(true);
    setError(null);
    try {
      const { original, thumbnail } = await makeTicketImages(file);
      setDraft((d) => withImage(d, { original: original.blob, thumbnail: thumbnail.blob }));
    } catch (e) {
      setError(`画像を読み込めませんでした：${e.message ?? e}`);
    } finally {
      setImageBusy(false);
    }
  };

  return html`
    <div class="screen">
      <header class="nav-bar">
        <button class="nav-side" onClick=${cancel}>キャンセル</button>
        <h1>${existing ? '半券を編集' : '半券を追加'}</h1>
        <button class="nav-side nav-strong" onClick=${save} disabled=${!canSave(draft) || saving || imageBusy}>
          ${saving ? '保存中' : '保存'}
        </button>
      </header>
      <main class="content form">
        ${error && html`<p class="error">${error}</p>`}

        <${ImageSection} draft=${draft} existing=${existing} busy=${imageBusy} onPick=${pickImage}
          onRemove=${() => setDraft((d) => withoutImage(d))} />

        <${FieldGroup}>
          <${TextField} label="公演名" value=${draft.title} onChange=${set('title')} placeholder="必須" wrap />
          <${SelectField} label="カテゴリー" value=${draft.category} onChange=${set('category')}
            options=${draft.category && !CATEGORIES.includes(draft.category) ? [...CATEGORIES, draft.category] : CATEGORIES} />
          <${TextField} label="ツアー名" value=${draft.subtitle} onChange=${set('subtitle')} placeholder="サブタイトルなど" wrap />
          <${TextField} label="出演者" value=${draft.performerNames} onChange=${set('performerNames')} placeholder="複数なら「、」で区切る" />
        <//>

        <${FieldGroup}>
          <${DateField} label="公演日" value=${draft.performanceDate} onChange=${set('performanceDate')} />
          <${OptionalTimeField} label="開場" enabled=${draft.hasOpenTime} value=${draft.openTime}
            onToggle=${set('hasOpenTime')} onChange=${set('openTime')} />
          <${OptionalTimeField} label="開演" enabled=${draft.hasStartTime} value=${draft.startTime}
            onToggle=${set('hasStartTime')} onChange=${set('startTime')} />
          <${TextField} label="会場" value=${draft.venue} onChange=${set('venue')} wrap />
        <//>

        <${FieldGroup} title="席" footer="整理番号は「その他」に「整理番号 A779」のように">
          ${SEAT_FIELDS.map((key) => html`
            <${TextField} key=${key} label=${SEAT_LABELS[key]} value=${draft.seat[key]} onChange=${setSeat(key)} />
          `)}
        <//>

        <${FieldGroup}>
          <${TextField} label="価格" value=${draft.priceText} onChange=${set('priceText')} placeholder="円" inputMode="numeric" />
          <${TextField} label="発券元" value=${draft.issuer} onChange=${set('issuer')} placeholder="ぴあ・e+・ローチケなど" />
        <//>

        <${FieldGroup} title="コメント">
          <${TextField} label="" value=${draft.comment} onChange=${set('comment')} multiline />
        <//>
      </main>
    </div>
  `;
}

function ImageSection({ draft, existing, busy, onPick, onRemove }) {
  const newThumbUrl = useObjectUrl(draft.imageChanged ? draft.image?.thumbnail : null);
  const camera = useRef(null);
  const library = useRef(null);
  const onFile = (e) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    onPick(file);
  };

  let preview = null;
  if (busy) preview = html`<div class="image-preview image-busy">画像を縮小中…</div>`;
  else if (newThumbUrl) preview = html`<img class="image-preview" src=${newThumbUrl} alt="選んだ画像" />`;
  else if (draft.hasImage && existing) preview = html`<div class="image-preview"><${Thumbnail} ticket=${existing} className="image-preview-thumb" /></div>`;

  return html`
    <section class="field-group">
      ${preview}
      <div class="image-buttons">
        <button type="button" class="button" onClick=${() => camera.current.click()} disabled=${busy}>📷 撮影</button>
        <button type="button" class="button" onClick=${() => library.current.click()} disabled=${busy}>🖼️ 写真を選ぶ</button>
        ${draft.hasImage && !busy && html`<button type="button" class="button danger-text" onClick=${onRemove}>外す</button>`}
      </div>
      <input ref=${camera} type="file" accept="image/*" capture="environment" hidden onChange=${onFile} />
      <input ref=${library} type="file" accept="image/*" hidden onChange=${onFile} />
    </section>
  `;
}

function isDirty(draft, initial) {
  if (!initial) return false;
  if (draft.imageChanged) return true;
  const { image: _a, ...rest } = draft;
  const { image: _b, ...base } = initial;
  return JSON.stringify(rest) !== JSON.stringify(base);
}
