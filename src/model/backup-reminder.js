// バックアップの案内を出すかどうか。

/** 書き出してから日が経っているか（一覧で案内する） */
export function backupIsStale(lastExportAt, ticketCount, now = new Date()) {
  if (ticketCount === 0) return false;
  if (!lastExportAt) return ticketCount >= 3;
  return now - new Date(lastExportAt) > 30 * 24 * 60 * 60 * 1000;
}
