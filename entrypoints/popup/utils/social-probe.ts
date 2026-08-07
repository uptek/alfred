import type { SocialProbeResult } from './social';

const PROBE_TIMEOUT_MS = 5000;

/**
 * Loads og:image in the popup document to verify it actually renders and to
 * read its real dimensions. Relies on the browser's HTTP cache rather than
 * any app-level cache — the point is to observe what a platform's fetch of
 * the same URL would see, not to remember it across popup opens.
 * @param url - Absolute image URL to probe.
 */
export function probeImage(url: string): Promise<SocialProbeResult> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;

    const finish = (result: SocialProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(result);
    };

    // Sharing platforms time out fetching a slow/unreachable image in a few
    // seconds; 5s keeps the popup from hanging on a dead host indefinitely.
    const timer = setTimeout(() => finish({ status: 'timeout' }), PROBE_TIMEOUT_MS);

    img.onload = () => finish({ status: 'ok', width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => finish({ status: 'error' });
    img.src = url;
  });
}
