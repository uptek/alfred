/**
 * Minimal structural element shape so the content script can pass a live
 * Element while tests pass plain objects.
 */
export type TextSourceElement = {
  textContent: string | null;
  getAttribute(name: string): string | null;
  querySelectorAll(selectors: string): Iterable<{ getAttribute(name: string): string | null }>;
};

/**
 * Resolves an element's accessible text: text content first, then aria-label,
 * then a descendant image's alt — mirroring what search engines read for
 * image-only headings and links. Callers supply the whitespace normalizer
 * (headings trim, links also collapse interior whitespace).
 * @param el - The element (or a minimal stand-in).
 * @param {(text: string) => string} normalize - Whitespace normalizer.
 * @returns {string} The accessible text; '' when the element has no name.
 */
export function accessibleText(el: TextSourceElement, normalize: (text: string) => string): string {
  const text = normalize(el.textContent ?? '');
  if (text) return text;

  const ariaLabel = normalize(el.getAttribute('aria-label') ?? '');
  if (ariaLabel) return ariaLabel;

  for (const img of el.querySelectorAll('img[alt]')) {
    const alt = normalize(img.getAttribute('alt') ?? '');
    if (alt) return alt;
  }

  return '';
}
