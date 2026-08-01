/** PDF Info/trailer meta damgası — xlsx sabit epoch ile uyumlu. */
export const EXPORT_PDF_INFO_DATE = "D:20200101000000Z";

const FIXED_PDF_ID = "<00000000000000000000000000000000><00000000000000000000000000000000>";

/**
 * pdfkit (ve bazı motorlar) CreationDate / ModDate / ID alanlarını rastgele üretir.
 * Yeniden üretilebilirlik için sabit değerlere çekilir.
 */
export function stabilizePdfBytes(input: Uint8Array): Uint8Array {
  let text = Buffer.from(input).toString("latin1");
  text = text.replace(/\/CreationDate\s*\([^)]*\)/g, `/CreationDate (${EXPORT_PDF_INFO_DATE})`);
  text = text.replace(/\/ModDate\s*\([^)]*\)/g, `/ModDate (${EXPORT_PDF_INFO_DATE})`);
  text = text.replace(/\/ID\s*\[\s*<[^>]+>\s*<[^>]+>\s*\]/g, `/ID [${FIXED_PDF_ID}]`);
  return new Uint8Array(Buffer.from(text, "latin1"));
}
