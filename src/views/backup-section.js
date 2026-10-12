// 設定画面のバックアップ：書き出し（ファイルを作る → 共有メニューで保存）と読み込み（確かめてから書き込む）。
// 共有メニューはタップの直後でないと開けない（iPhone）。ファイル作りに時間がかかるので、作る・保存するを2回のタップに分ける。
import { useRef, useState } from 'preact/hooks';
import { html } from '../html.js';
import { useData } from '../data.js';
import { exportBackupFile, readBackupFile, runImport } from '../backup-io.js';
import { planImport } from '../model/backup.js';

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

export function BackupSection() {
  const { store, tickets, performers, mutate, lastExportAt, recordExport } = useData();
  const [includeSources, setIncludeSources] = useState(true);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState(null);
  const [pending, setPending] = useState(null);
  const input = useRef(null);
  const busy = progress != null;

  const prepare = async () => {
    setMessage(null);
    setFile(null);
    setProgress({ label: '書き出し中', done: 0, total: tickets.length });
    try {
      const f = await exportBackupFile(store, {
        includeSources,
        onProgress: (done, total) => setProgress({ label: '書き出し中', done, total }),
      });
      setFile(f);
    } catch (e) {
      setMessage({ error: true, text: `書き出せませんでした：${e.message ?? e}` });
    } finally {
      setProgress(null);
    }
  };

  const share = async () => {
    try {
      if (!navigator.canShare?.({ files: [file] })) throw new Error('共有できません。「ダウンロード」を使ってください');
      await navigator.share({ files: [file] });
      await recordExport();
      setMessage({ text: '書き出しました。「ファイル」アプリやクラウドに保存されたか確かめてください' });
      setFile(null);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      setMessage({ error: true, text: e.message ?? String(e) });
    }
  };

  const download = async () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    await recordExport();
    setMessage({ text: 'ダウンロードを始めました' });
    setFile(null);
  };

  const pick = async (e) => {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!f) return;
    setMessage(null);
    setProgress({ label: 'ファイルを確認中' });
    try {
      const { backup, errors } = await readBackupFile(f);
      if (errors.length) {
        setPending({ errors, name: f.name });
      } else {
        setPending({ name: f.name, backup, plan: planImport(backup, { tickets, performers }) });
      }
    } finally {
      setProgress(null);
    }
  };

  const doImport = async () => {
    const { plan } = pending;
    setPending(null);
    setProgress({ label: '読み込み中', done: 0, total: plan.tickets.length });
    try {
      await mutate((s) => runImport(s, plan, { onProgress: (done, total) => setProgress({ label: '読み込み中', done, total }) }));
      setMessage({ text: `${plan.summary.tickets}枚を読み込みました` });
    } catch (e) {
      setMessage({ error: true, text: `途中で止まりました：${e.message ?? e}。もう一度同じファイルを読み込めば、続きから揃います` });
    } finally {
      setProgress(null);
    }
  };

  return html`
    <section class="card backup">
      <h2 class="card-title">バックアップ</h2>
      <p class="note">
        データはこの iPhone の中にだけあります。機種変更やアプリの削除で消えるので、ときどき書き出して「ファイル」アプリやクラウドに保存してください。
      </p>
      <p class="backup-last">最後の書き出し：${lastExportAt ? new Date(lastExportAt).toLocaleString('ja-JP') : 'まだありません'}</p>

      ${!file && html`
        <label class="check">
          <input type="checkbox" checked=${includeSources} onChange=${(e) => setIncludeSources(e.currentTarget.checked)} disabled=${busy} />
          切り抜く前の写真も含める（ファイルがおよそ倍の大きさになる）
        </label>
        <button class="button primary wide" onClick=${prepare} disabled=${busy || tickets.length === 0}>書き出す（${tickets.length}枚）</button>
      `}
      ${file && html`
        <p>ファイルができました（${mb(file.size)}）。保存先を選んでください。</p>
        <button class="button primary wide" onClick=${share}>共有メニューで保存</button>
        <button class="button wide" onClick=${download}>ダウンロード</button>
        <button class="link-button" onClick=${() => setFile(null)}>やめる</button>
      `}

      <button class="button wide" onClick=${() => input.current.click()} disabled=${busy}>バックアップを読み込む</button>
      <input ref=${input} type="file" accept=".json,application/json" hidden onChange=${pick} />

      ${progress && html`
        <p class="backup-progress">
          ${progress.label}…${progress.total ? ` ${progress.done} / ${progress.total}` : ''}
          ${progress.total ? html`<progress max=${progress.total} value=${progress.done}></progress>` : ''}
        </p>
      `}
      ${message && html`<p class=${message.error ? 'error' : 'notice'}>${message.text}</p>`}

      ${pending?.errors && html`
        <div class="error">
          <p>「${pending.name}」は読み込めません。</p>
          <ul>${pending.errors.slice(0, 5).map((e) => html`<li>${e}</li>`)}</ul>
          ${pending.errors.length > 5 && html`<p>ほか ${pending.errors.length - 5} 件</p>`}
          <button class="button" onClick=${() => setPending(null)}>閉じる</button>
        </div>
      `}
      ${pending?.plan && html`
        <div class="import-plan">
          <p><strong>「${pending.name}」</strong>${pending.backup.exportedAt ? `（${new Date(pending.backup.exportedAt).toLocaleString('ja-JP')} に${pending.backup.app === 'ios' ? ' iOS 版で' : ''}書き出し）` : ''}</p>
          <ul>
            <li>半券 ${pending.plan.summary.tickets}枚（新しい ${pending.plan.summary.newTickets}枚・上書き ${pending.plan.summary.overwritten}枚、画像あり ${pending.plan.summary.withImage}枚）</li>
            <li>出演者：新しい ${pending.plan.summary.newPerformers}人${pending.plan.summary.matchedPerformers ? `・名前が同じで今の出演者にまとめる ${pending.plan.summary.matchedPerformers}人` : ''}</li>
          </ul>
          <p class="note">今の半券は消しません。同じ半券（同じ id）はファイルの内容で上書きします。</p>
          <button class="button primary wide" onClick=${doImport}>読み込む</button>
          <button class="button wide" onClick=${() => setPending(null)}>やめる</button>
        </div>
      `}
    </section>
  `;
}
