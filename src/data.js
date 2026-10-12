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

  useEffect(() => {
    TicketStore.open()
      .then(async (s) => {
        setStore(s);
        setData(await s.loadAll());
        setLoaded(true);
      })
      .catch((e) => setError(e));
  }, []);

  const mutate = useCallback(async (fn) => {
    await fn(store);
    setData(await store.loadAll());
  }, [store]);

  const performersById = useMemo(() => new Map(data.performers.map((p) => [p.id, p])), [data.performers]);

  return { store, ...data, performersById, loaded, error, mutate };
}
