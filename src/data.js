// アプリ全体で使う半券・出演者のデータ。保存のたびに読み直して画面に反映する。
import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { TicketStore } from './store/db.js';

const DataContext = createContext(null);
export const DataProvider = DataContext.Provider;

export function useData() {
  return useContext(DataContext);
}

/** 保存先を開き、全件を読み込む。mutate(fn) で書き込んでから読み直す */
export function useTicketData() {
  const [store, setStore] = useState(null);
  const [data, setData] = useState({ tickets: [], performers: [] });
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [lastExportAt, setLastExportAt] = useState(null);

  useEffect(() => {
    TicketStore.open()
      .then(async (s) => {
        setStore(s);
        setData(await s.loadAll());
        setLastExportAt((await s.getMeta('lastExportAt')) ?? null);
        setLoaded(true);
      })
      .catch((e) => setError(e));
  }, []);

  const mutate = useCallback(async (fn) => {
    await fn(store);
    setData(await store.loadAll());
  }, [store]);

  /** バックアップを書き出したことを記録する（一覧の「バックアップを」の案内に使う） */
  const recordExport = useCallback(async () => {
    const now = new Date().toISOString();
    await store.setMeta('lastExportAt', now);
    setLastExportAt(now);
  }, [store]);

  const performersById = useMemo(() => new Map(data.performers.map((p) => [p.id, p])), [data.performers]);

  return { store, ...data, performersById, loaded, error, mutate, lastExportAt, recordExport };
}
