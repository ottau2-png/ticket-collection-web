// フォームの部品。見出しを常に左に出し（値が入ってもどの欄か分かるように）、文字のある欄には × を出す。
import { useLayoutEffect, useRef } from 'preact/hooks';
import { html } from '../html.js';

/**
 * 文字入力。× でその欄だけ空にする。
 * multiline：改行できる複数行。wrap：改行はできないが、長い値は折り返して全部見せる（公演名など）。
 * 入力中に input と textarea を入れ替えるとフォーカスが外れるので、wrap は最初から textarea にして高さだけ変える。
 */
export function TextField({ label, value, onChange, multiline = false, wrap = false, placeholder = '', inputMode }) {
  const area = useRef(null);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const input = multiline || wrap
    ? html`<textarea
        ref=${area}
        class="field-input"
        rows=${multiline ? 3 : 1}
        value=${value}
        placeholder=${placeholder}
        enterkeyhint=${wrap ? 'done' : undefined}
        onKeyDown=${wrap ? (e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur()) : undefined}
        onInput=${(e) => onChange(wrap ? e.currentTarget.value.replace(/\r?\n/g, ' ') : e.currentTarget.value)}
      ></textarea>`
    : html`<input
        class="field-input"
        type="text"
        value=${value}
        placeholder=${placeholder}
        inputmode=${inputMode}
        autocomplete="off"
        onInput=${(e) => onChange(e.currentTarget.value)}
      />`;
  return html`
    <label class=${`field ${multiline ? 'field-multiline' : ''}`}>
      ${label && html`<span class="field-label">${label}</span>`}
      ${input}
      ${value !== '' && html`
        <button type="button" class="field-clear" aria-label=${`${label}を消す`} onClick=${(e) => {
          e.preventDefault();
          onChange('');
        }}>×</button>
      `}
    </label>
  `;
}

export function SelectField({ label, value, onChange, options, emptyLabel = '未設定' }) {
  return html`
    <label class="field">
      <span class="field-label">${label}</span>
      <select class="field-input" value=${value} onChange=${(e) => onChange(e.currentTarget.value)}>
        <option value="">${emptyLabel}</option>
        ${options.map((o) => html`<option value=${o}>${o}</option>`)}
      </select>
    </label>
  `;
}

export function DateField({ label, value, onChange }) {
  return html`
    <label class="field">
      <span class="field-label">${label}</span>
      <input class="field-input" type="date" value=${value} required onChange=${(e) => e.currentTarget.value && onChange(e.currentTarget.value)} />
    </label>
  `;
}

/** オン／オフつきの時刻（開場・開演）。オフなら時刻は保存しない */
export function OptionalTimeField({ label, enabled, value, onToggle, onChange }) {
  return html`
    <div class="field">
      <span class="field-label">${label}</span>
      ${enabled
        ? html`<input class="field-input" type="time" value=${value} onChange=${(e) => e.currentTarget.value && onChange(e.currentTarget.value)} />`
        : html`<span class="field-input field-off">なし</span>`}
      <label class="switch">
        <input type="checkbox" checked=${enabled} onChange=${(e) => onToggle(e.currentTarget.checked)} aria-label=${`${label}の時刻を入れる`} />
        <span class="switch-track"></span>
      </label>
    </div>
  `;
}

export function FieldGroup({ title, children, footer }) {
  return html`
    <section class="field-group">
      ${title && html`<h2 class="group-title">${title}</h2>`}
      <div class="group-body">${children}</div>
      ${footer && html`<p class="group-footer">${footer}</p>`}
    </section>
  `;
}
