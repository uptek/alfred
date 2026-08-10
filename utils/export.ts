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
 * Triggers a browser download of in-memory content via a temporary blob URL.
 * @param {string} content - File body.
 * @param {string} filename - Suggested filename.
 * @param {string} mime - MIME type for the blob.
 */
export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Derives a filesystem-safe slug from a page domain for export filenames.
 * @param {string | undefined} domain - Hostname, possibly with www prefix.
 * @returns {string} Slug, or "site" when no domain is available.
 */
export function siteSlug(domain?: string): string {
  return (
    domain
      ?.replace(/^www\./, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/-+$/, '') ?? 'site'
  );
}
