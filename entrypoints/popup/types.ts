export interface RawHeading {
  level: number;
  text: string;
  isHidden: boolean;
}

export type LinkKind = 'internal' | 'external' | 'mailto' | 'tel' | 'other';

export interface RawLink {
  index: number; // position among all a[href] elements in DOM order (stable key)
  href: string; // resolved absolute URL
  text: string; // accessible anchor text: textContent → aria-label → img alt, whitespace collapsed
  rel: string; // raw rel attribute
  kind: LinkKind; // internal/external for http(s); mailto/tel/other never count as external
  isNofollow: boolean; // rel contains nofollow
  isSponsored: boolean; // rel contains sponsored (nofollow-class hint)
  isUgc: boolean; // rel contains ugc (nofollow-class hint)
  isImage: boolean; // contains an img/svg/picture descendant
  isHidden: boolean; // !checkVisibility()
  isInsecure: boolean; // plain-http target on a non-loopback host
  isBrokenAnchor: boolean; // same-page #fragment with no matching id/name on the page
}

export type AssetKind = 'script' | 'style';
export type AssetLoad = 'async' | 'defer' | 'blocking' | 'inline';
export type AssetPlacement = 'head' | 'body' | 'footer';
// Script subtypes come from assets.ts scriptSubtype(); all styles are 'stylesheet'.
export type AssetSubtype =
  | 'classic'
  | 'module'
  | 'importmap'
  | 'speculationrules'
  | 'json'
  | 'ld+json'
  | 'data'
  | 'stylesheet';

export interface RawAsset {
  index: number; // index among all script/link/style nodes in DOM order (stable key)
  kind: AssetKind;
  src: string | null; // resolved URL for external; null for inline
  isExternal: boolean; // src/href points to a different host (www variant counts as same site)
  isBrowserExtension: boolean; // injected by a browser extension (chrome-extension:// etc.)
  isInline: boolean; // no src/href
  type: string; // raw type attribute ('classic'/'stylesheet'/'inline' fallbacks); searchable
  subtype: AssetSubtype; // classified type: only classic/module scripts execute or fetch
  load: AssetLoad; // async/defer/blocking for scripts; 'inline' for inline; 'blocking' for stylesheets
  media: string; // stylesheet media attribute (empty otherwise)
  size: number; // transfer/byte size; 0 if unknown (opaque cross-origin)
  content: string | null; // inline content, capped; null for external
  placement: AssetPlacement; // where in the document the node lives
  cached: boolean; // served from cache (Resource Timing transferSize === 0)
  duration: number; // load duration in ms (0 if unknown)
  status: number; // HTTP status code (0 if unknown / opaque)
  renderBlocking: boolean; // blocks first render (head, synchronous)
}

export type HeadingIssueType = 'missing-h1' | 'multiple-h1' | 'skipped-level' | 'empty' | 'h1-not-first';

export interface HeadingIssue {
  type: HeadingIssueType;
  details?: string;
  index?: number; // single affected heading (position in the full headings array)
  indexes?: number[]; // all affected headings (multiple-h1: every H1 gets a row marker)
}

export type InfoItemType = 'url' | 'text';

export interface InfoItemProps {
  label: string;
  value: string | undefined | null;
  type?: InfoItemType;
  isLast?: boolean;
  copyable?: boolean;
}

export interface Theme {
  name?: string;
  id?: number;
  schema_name?: string;
  schema_version?: string;
  theme_store_id?: number;
  role?: string;
  handle?: string;
  author?: string;
}

export interface StoreInfo {
  isShopify: boolean;
  shopDomain: string | null; // .myshopify.com domain
  domain: string | null; // Current URL domain (from page_url)
  page_url: string | null;
  theme: Theme | null;
  themeStoreEntry?: ThemeStoreEntry | null;
}

export interface ThemeStoreEntry {
  name: string;
  theme_store_id: number;
  version: string;
  price: string;
  theme_url: string;
  developer: {
    name: string;
    url: string;
  };
}

export type ImageSource = 'img' | 'picture' | 'background';
export type ImageLoading = 'lazy' | 'eager' | 'none';
export type ImageStatus = 'ok' | 'missing-alt' | 'broken';

export interface RawImage {
  index: number; // stable key: position in collectImageEls() order (DOM order: imgs, then backgrounds)
  source: ImageSource;
  src: string; // resolved currentSrc (img/picture) or background-image URL; '' if none
  alt: string | null; // null when source === 'background'; '' when attr present but empty
  lacksAlt: boolean; // true when alt attr is absent or empty/whitespace (img/picture only)
  isResponsive: boolean; // had srcset/sizes, or was inside <picture>
  naturalWidth: number; // 0 if unknown (lazy / not decoded / background)
  naturalHeight: number;
  format: string; // png|jpg|webp|avif|gif|svg, parsed from src extension; '' if unknown
  loading: ImageLoading;
  size: number; // bytes from Resource Timing; 0 = unknown
  cached: boolean; // served from cache (transferSize === 0 && decodedBodySize > 0)
  isExternal: boolean; // src host !== page host
  isHidden: boolean; // !checkVisibility()
  broken: boolean; // loaded <img> with naturalWidth === 0
}
