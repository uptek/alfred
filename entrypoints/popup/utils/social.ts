// Open Graph / Twitter Card resolution, linting, and per-platform preview
// modeling. Pure TypeScript (no DOM/browser APIs besides Intl.Segmenter) so it
// can be tested with `bun test`.
import type { RawSocial } from './types';
import { queryActiveTab } from './messaging';

/**
 * Fetches Open Graph / Twitter Card meta tags from the active tab via content script.
 */
export const getSocial = (): Promise<RawSocial | null> =>
  queryActiveTab<RawSocial | null>('get_social', null, (r) => !!r && Array.isArray((r as RawSocial).metas));

export type SocialPlatform = 'facebook' | 'x' | 'linkedin';
export type SocialSeverity = 'error' | 'warning' | 'info';

export interface SocialImage {
  url: string;
  secureUrl?: string;
  declaredWidth?: number;
  declaredHeight?: number;
  mimeType?: string;
  alt?: string;
}

export interface ResolvedSocial {
  og: { title?: string; description?: string; url?: string; type?: string; siteName?: string };
  images: SocialImage[]; // ordered; first wins for preview
  twitter: { card?: string; title?: string; description?: string; image?: string };
  fbAppId?: string;
  fallbacks: { title: string; description: string; url: string };
  duplicateCounts: Record<string, number>; // key -> occurrences, only keys seen >1 (root og:image counts as one key)
  hasAnyTags: boolean;
}

export interface SocialProbeResult {
  status: 'ok' | 'error' | 'timeout';
  width?: number;
  height?: number;
}

export interface SocialFinding {
  id: string;
  severity: SocialSeverity;
  message: string;
  platforms: SocialPlatform[];
  fromProbe?: boolean;
}

const ALL_PLATFORMS: SocialPlatform[] = ['facebook', 'x', 'linkedin'];

const parseIntOrUndefined = (value: string): number | undefined => {
  if (!/^\d+$/.test(value.trim())) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

export function resolveSocial(raw: RawSocial): ResolvedSocial {
  const og: ResolvedSocial['og'] = {};
  const twitter: ResolvedSocial['twitter'] = {};
  const images: SocialImage[] = [];
  let fbAppId: string | undefined;
  const seenCounts: Record<string, number> = {};
  let ogImageRoots = 0;
  let hasAnyTags = false;

  const bump = (key: string): void => {
    seenCounts[key] = (seenCounts[key] || 0) + 1;
  };

  let currentImage: SocialImage | null = null;

  for (const meta of raw.metas) {
    const key = meta.key;
    const value = meta.value;

    if (key.startsWith('og:') || key.startsWith('twitter:')) hasAnyTags = true;

    if (key === 'og:image' || key === 'og:image:url') {
      currentImage = { url: value };
      images.push(currentImage);
      ogImageRoots += 1;
      continue;
    }

    if (key === 'og:image:secure_url') {
      if (currentImage) currentImage.secureUrl = value;
      continue;
    }
    if (key === 'og:image:width') {
      const n = parseIntOrUndefined(value);
      if (currentImage && n !== undefined) currentImage.declaredWidth = n;
      continue;
    }
    if (key === 'og:image:height') {
      const n = parseIntOrUndefined(value);
      if (currentImage && n !== undefined) currentImage.declaredHeight = n;
      continue;
    }
    if (key === 'og:image:type') {
      if (currentImage) currentImage.mimeType = value;
      continue;
    }
    if (key === 'og:image:alt') {
      if (currentImage) currentImage.alt = value;
      continue;
    }

    if (key === 'og:title') {
      if (og.title !== undefined) bump('og:title');
      og.title = value;
      continue;
    }
    if (key === 'og:description') {
      if (og.description !== undefined) bump('og:description');
      og.description = value;
      continue;
    }
    if (key === 'og:url') {
      if (og.url !== undefined) bump('og:url');
      og.url = value;
      continue;
    }
    if (key === 'og:type') {
      if (og.type !== undefined) bump('og:type');
      og.type = value;
      continue;
    }
    if (key === 'og:site_name') {
      if (og.siteName !== undefined) bump('og:site_name');
      og.siteName = value;
      continue;
    }

    if (key === 'fb:app_id') {
      if (fbAppId !== undefined) bump('fb:app_id');
      fbAppId = value;
      continue;
    }

    if (key === 'twitter:card') {
      if (twitter.card !== undefined) bump('twitter:card');
      twitter.card = value;
      continue;
    }
    if (key === 'twitter:title') {
      if (twitter.title !== undefined) bump('twitter:title');
      twitter.title = value;
      continue;
    }
    if (key === 'twitter:description') {
      if (twitter.description !== undefined) bump('twitter:description');
      twitter.description = value;
      continue;
    }
    if (key === 'twitter:image' || key === 'twitter:image:src') {
      if (twitter.image !== undefined) bump('twitter:image');
      twitter.image = value;
      continue;
    }
  }

  const duplicateCounts: Record<string, number> = {};
  for (const [key, extra] of Object.entries(seenCounts)) {
    duplicateCounts[key] = extra + 1;
  }
  if (ogImageRoots > 1) duplicateCounts['og:image'] = ogImageRoots;

  return {
    og,
    images,
    twitter,
    ...(fbAppId !== undefined ? { fbAppId } : {}),
    fallbacks: {
      title: raw.fallbackTitle,
      description: raw.fallbackDescription,
      url: raw.pageUrl
    },
    duplicateCounts,
    hasAnyTags
  };
}

const hasScheme = (url: string): boolean => /:\/\//.test(url);

const resolveUrl = (url: string, base: string): string => {
  if (hasScheme(url)) return url;
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
};

// Image URLs land in <img src> sinks; anything but http(s) (javascript:, data:, mailto:)
// is rejected outright rather than trusted to stay harmless in that sink.
const httpOnly = (url: string | null): string | null => (url && /^https?:/i.test(url) ? url : null);

export function probeTargetUrl(resolved: ResolvedSocial): string | null {
  const first = resolved.images[0];
  if (!first) return null;
  const raw = first.secureUrl ?? first.url;
  if (!raw) return null;
  return httpOnly(resolveUrl(raw, resolved.fallbacks.url));
}

const isLocalhost = (url: string): boolean => {
  try {
    return new URL(url).hostname === 'localhost';
  } catch {
    return false;
  }
};

const pathnameOf = (url: string): string => {
  try {
    return new URL(url, 'http://placeholder').pathname;
  } catch {
    return url;
  }
};

const ENTITY_PATTERN = /&(amp|lt|gt|quot|#\d+|#x[0-9a-f]+);/i;

const collectTextValues = (resolved: ResolvedSocial): string[] => {
  const values: string[] = [];
  if (resolved.og.title) values.push(resolved.og.title);
  if (resolved.og.description) values.push(resolved.og.description);
  if (resolved.og.siteName) values.push(resolved.og.siteName);
  if (resolved.twitter.title) values.push(resolved.twitter.title);
  if (resolved.twitter.description) values.push(resolved.twitter.description);
  return values;
};

// FB min: https://developers.facebook.com/docs/sharing/webmasters/images/
// X min: https://developer.x.com/en/docs/x-for-websites/cards/overview/markup
// LinkedIn recommended: https://www.linkedin.com/help/linkedin/answer/a521928
const FB_MIN = { w: 200, h: 200 };
const FB_RECOMMENDED = { w: 1200, h: 630 };
const X_LARGE_MIN = { w: 300, h: 157 };
const X_SUMMARY_MIN = { w: 144, h: 144 };

export function lintSocial(resolved: ResolvedSocial, probe: SocialProbeResult | null): SocialFinding[] {
  const findings: SocialFinding[] = [];
  const first = resolved.images[0];

  if (!resolved.hasAnyTags) {
    findings.push({
      id: 'no-social-tags',
      severity: 'error',
      message: 'No Open Graph or Twitter Card tags found — platforms will infer everything from page HTML',
      platforms: ALL_PLATFORMS
    });
  } else {
    const missing: { id: string; label: string }[] = [
      { id: 'missing-og-title', label: 'og:title' },
      { id: 'missing-og-description', label: 'og:description' },
      { id: 'missing-og-image', label: 'og:image' },
      { id: 'missing-og-url', label: 'og:url' },
      { id: 'missing-og-type', label: 'og:type' }
    ];
    const values: Record<string, unknown> = {
      'missing-og-title': resolved.og.title,
      'missing-og-description': resolved.og.description,
      'missing-og-image': first,
      'missing-og-url': resolved.og.url,
      'missing-og-type': resolved.og.type
    };
    for (const { id, label } of missing) {
      if (values[id] === undefined) {
        findings.push({
          id,
          severity: 'error',
          message: `${label} missing — platforms will infer from page HTML`,
          platforms: ALL_PLATFORMS
        });
      }
    }

    if (resolved.fbAppId === undefined) {
      findings.push({
        id: 'fb-app-id-missing',
        severity: 'info',
        message: "fb:app_id missing — Facebook Insights won't attribute shares to your app",
        platforms: ['facebook']
      });
    }
  }

  if (first) {
    const isRelative = !hasScheme(first.url);
    const isInsecure = !isRelative && first.url.startsWith('http:') && !first.secureUrl && !isLocalhost(first.url);

    if (isInsecure) {
      findings.push({
        id: 'og-image-insecure',
        severity: 'warning',
        message: 'og:image uses http: with no og:image:secure_url — some platforms will refuse to render it',
        platforms: ALL_PLATFORMS
      });
    }

    if (isRelative) {
      findings.push({
        id: 'og-image-relative',
        severity: 'warning',
        message: 'og:image is a relative URL — spec requires an absolute URL',
        platforms: ALL_PLATFORMS
      });
    }

    const isSvg = first.mimeType === 'image/svg+xml' || pathnameOf(first.url).endsWith('.svg');
    if (isSvg) {
      findings.push({
        id: 'og-image-svg',
        severity: 'info',
        message: 'og:image is an SVG — most platforms do not render SVG preview images',
        platforms: ALL_PLATFORMS
      });
    }
  }

  if ((resolved.duplicateCounts['og:image'] ?? 0) > 1) {
    findings.push({
      id: 'og-image-multiple',
      severity: 'info',
      message: `${resolved.duplicateCounts['og:image']} og:image tags found — the first is used for preview`,
      platforms: ALL_PLATFORMS
    });
  }

  if (resolved.og.description) {
    const graphemeCount = countGraphemes(resolved.og.description);
    if (graphemeCount > 300) {
      findings.push({
        id: 'description-overflow',
        severity: 'warning',
        message: `og:description is ${graphemeCount} characters — Facebook truncates around 300, often mid-word`,
        platforms: ['facebook']
      });
    }
  }

  if (collectTextValues(resolved).some((v) => ENTITY_PATTERN.test(v))) {
    findings.push({
      id: 'entity-double-encoded',
      severity: 'warning',
      message:
        'Tag value still contains an HTML entity after decoding — source is double-encoded and platforms will render it literally',
      platforms: ALL_PLATFORMS
    });
  }

  if (resolved.twitter.card && !resolved.twitter.image && first) {
    findings.push({
      id: 'twitter-image-fallback',
      severity: 'info',
      message: 'No twitter:image set, but og:image is present — X falls back to it automatically',
      platforms: ['x']
    });
  }

  if (resolved.og.type === 'product') {
    findings.push({
      id: 'og-type-product',
      severity: 'info',
      message: 'og:type is "product" — LinkedIn and Facebook treat it as a generic article/link',
      platforms: ['linkedin', 'facebook']
    });
  }

  const effectiveDims = effectiveDimensions(resolved, probe);
  if (effectiveDims) {
    const { width, height, fromProbe } = effectiveDims;

    if (
      probe?.status === 'ok' &&
      first?.declaredWidth !== undefined &&
      first?.declaredHeight !== undefined &&
      probe.width !== undefined &&
      probe.height !== undefined &&
      (first.declaredWidth !== probe.width || first.declaredHeight !== probe.height)
    ) {
      findings.push({
        id: 'declared-dimensions-mismatch',
        severity: 'warning',
        message: `Declared og:image dimensions ${first.declaredWidth}x${first.declaredHeight} do not match the actual image ${probe.width}x${probe.height}`,
        platforms: ALL_PLATFORMS,
        fromProbe: true
      });
    }

    const failing: SocialPlatform[] = [];
    if (width < FB_MIN.w || height < FB_MIN.h) failing.push('facebook');
    if (resolved.twitter.card === 'summary') {
      if (width < X_SUMMARY_MIN.w || height < X_SUMMARY_MIN.h) failing.push('x');
    } else if (width < X_LARGE_MIN.w || height < X_LARGE_MIN.h) {
      failing.push('x');
    }
    if (failing.length > 0) {
      const mins: string[] = [];
      if (failing.includes('facebook'))
        mins.push(
          `Facebook needs at least ${FB_MIN.w}x${FB_MIN.h}, recommends ${FB_RECOMMENDED.w}x${FB_RECOMMENDED.h}`
        );
      if (failing.includes('x'))
        mins.push(
          resolved.twitter.card === 'summary'
            ? `X summary cards need at least ${X_SUMMARY_MIN.w}x${X_SUMMARY_MIN.h}`
            : `X large cards need at least ${X_LARGE_MIN.w}x${X_LARGE_MIN.h}`
        );
      findings.push({
        id: 'image-too-small',
        severity: 'warning',
        message: `og:image is ${width}x${height}, below the minimum for ${failing.join(', ')} (${mins.join('; ')})`,
        platforms: failing,
        fromProbe
      });
    }

    const ratio = width / height;
    // 10% tolerance: platforms crop near-square images the same way as exact squares.
    const isSquare = ratio > 0.9 && ratio < 1.1;
    if (isSquare) {
      const squarePlatforms: SocialPlatform[] = ['facebook', 'linkedin'];
      if (resolved.twitter.card === 'summary_large_image') squarePlatforms.push('x');
      findings.push({
        id: 'image-ratio-square',
        severity: 'warning',
        message: 'og:image is roughly square — platforms expecting a landscape card will crop it',
        platforms: squarePlatforms,
        fromProbe
      });
    }
  }

  if (probe?.status === 'error') {
    findings.push({
      id: 'image-unloadable',
      severity: 'error',
      message: 'og:image could not be loaded',
      platforms: ALL_PLATFORMS,
      fromProbe: true
    });
  } else if (probe?.status === 'timeout') {
    findings.push({
      id: 'image-unverified',
      severity: 'info',
      message: 'og:image could not be verified in time',
      platforms: ALL_PLATFORMS,
      fromProbe: true
    });
  }

  return findings;
}

function effectiveDimensions(
  resolved: ResolvedSocial,
  probe: SocialProbeResult | null
): { width: number; height: number; fromProbe: boolean } | null {
  if (probe?.status === 'ok' && probe.width !== undefined && probe.height !== undefined) {
    return { width: probe.width, height: probe.height, fromProbe: true };
  }
  const first = resolved.images[0];
  if (first?.declaredWidth !== undefined && first?.declaredHeight !== undefined) {
    return { width: first.declaredWidth, height: first.declaredHeight, fromProbe: false };
  }
  return null;
}

export function badgeCount(resolved: ResolvedSocial): number {
  return lintSocial(resolved, null).filter((f) => f.severity === 'error').length;
}

const segmentGraphemes = (text: string): string[] => {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return [...segmenter.segment(text)].map((s) => s.segment);
};

const countGraphemes = (text: string): number => segmentGraphemes(text).length;

export function graphemeSlice(text: string, max: number): string {
  const graphemes = segmentGraphemes(text);
  if (graphemes.length <= max) return text;
  return graphemes.slice(0, max).join('');
}

export interface PlatformPreview {
  title: string;
  description: string;
  domain: string;
  imageUrl: string | null;
  cardType: 'large' | 'small' | 'bare';
  inferred: boolean;
}

const domainOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export function previewModel(resolved: ResolvedSocial, platform: SocialPlatform): PlatformPreview {
  const isX = platform === 'x';

  const title = (isX ? (resolved.twitter.title ?? resolved.og.title) : resolved.og.title) ?? resolved.fallbacks.title;
  const description =
    (isX ? (resolved.twitter.description ?? resolved.og.description) : resolved.og.description) ??
    resolved.fallbacks.description;
  const url = resolved.og.url ?? resolved.fallbacks.url;
  const domain = domainOf(url);

  const inferred =
    (isX ? resolved.twitter.title === undefined && resolved.og.title === undefined : resolved.og.title === undefined) ||
    (isX
      ? resolved.twitter.description === undefined && resolved.og.description === undefined
      : resolved.og.description === undefined);

  let imageUrl: string | null;
  if (isX && resolved.twitter.image) {
    imageUrl = httpOnly(resolveUrl(resolved.twitter.image, resolved.fallbacks.url));
  } else {
    imageUrl = probeTargetUrl(resolved);
  }

  let cardType: PlatformPreview['cardType'];
  if (isX) {
    if (!imageUrl) {
      cardType = 'bare';
    } else if (resolved.twitter.card === 'summary') {
      cardType = 'small';
    } else {
      cardType = 'large';
    }
  } else {
    cardType = imageUrl ? 'large' : 'bare';
  }

  return { title, description, domain, imageUrl, cardType, inferred };
}
