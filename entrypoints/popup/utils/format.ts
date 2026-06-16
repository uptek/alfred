/**
 * Encodes one CSV field: quotes it, doubles embedded quotes, and prefixes
 * formula-leading characters (= + - @, tab, CR) with an apostrophe so text
 * scraped from arbitrary pages can't execute as a spreadsheet formula.
 * @param {unknown} value - Field value; stringified before encoding.
 * @returns {string} The encoded field including surrounding quotes.
 */
export function csvField(value: unknown): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Formats a byte count for the Size columns: B under 1 KB, then KB and MB
 * with one decimal.
 * @param {number} bytes - Byte count.
 * @returns {string} Human-readable size.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  // Pick the unit after rounding so 1048575 reads "1.0 MB", not "1024.0 KB".
  if (Math.round(kb * 10) < 1024 * 10) return `${kb.toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
