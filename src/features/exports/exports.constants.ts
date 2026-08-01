/** v1 üst satır sınırı — aşılırsa filtre daraltılmalı. */
export const EXPORT_MAX_ROWS = 50000;

/** xlsx meta damgası sabitlenir; yeniden üretilebilirlik için gerçek zaman kullanılmaz. */
export const EXPORT_XLSX_EPOCH_MS = Date.UTC(2020, 0, 1, 0, 0, 0, 0);

/** pdf Info CreationDate/ModDate ile aynı an. */
export const EXPORT_PDF_EPOCH_MS = EXPORT_XLSX_EPOCH_MS;
