import type { LinkStatusBucket, LinkStatusResult } from '@/entrypoints/popup/utils/types';

const TIMEOUT_MS = 8000;
const MAX_RETRY_WAIT_MS = 8000;
const DEFAULT_RETRY_WAIT_MS = 2000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function bucketFor(status: number): LinkStatusBucket {
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 300 && status < 400) return 'redirect';
  if (status >= 400 && status < 500) return 'client-error';
  if (status >= 500) return 'server-error';
  return 'error';
}

// Honour a 429/503 Retry-After (seconds or HTTP date), capped so one slow link
// can't stall the whole sweep.
function retryAfterMs(res: Response): number {
  const raw = res.headers.get('retry-after');
  if (!raw) return DEFAULT_RETRY_WAIT_MS;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.min(Math.max(secs, 0) * 1000, MAX_RETRY_WAIT_MS);
  const when = Date.parse(raw);
  if (!Number.isNaN(when)) return Math.max(0, Math.min(when - Date.now(), MAX_RETRY_WAIT_MS));
  return DEFAULT_RETRY_WAIT_MS;
}

async function probeOnce(url: string): Promise<{ result: LinkStatusResult; retryAfter?: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: controller.signal });
    if (res.type === 'opaqueredirect') {
      return { result: { status: 0, bucket: 'redirect', redirected: true } };
    }
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', redirect: 'manual', signal: controller.signal });
      if (res.type === 'opaqueredirect') {
        return { result: { status: 0, bucket: 'redirect', redirected: true } };
      }
    }
    const result: LinkStatusResult = {
      status: res.status,
      bucket: bucketFor(res.status),
      redirected: res.redirected,
      ...(res.url ? { finalUrl: res.url } : {})
    };
    if (res.status === 429 || res.status === 503) return { result, retryAfter: retryAfterMs(res) };
    return { result };
  } catch {
    return { result: { status: 0, bucket: 'error', redirected: false } };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks a URL's HTTP status from the service worker, where `<all_urls>` host
 * permissions let fetches bypass CORS and read real cross-origin status codes.
 *
 * HEAD avoids downloading bodies and minimises side effects; GET is a fallback
 * only when a server rejects HEAD. `redirect: 'manual'` surfaces redirects as
 * opaque responses (status 0), so 3xx is reported as a bucket, not an exact code.
 *
 * On a 429/503 it backs off once (honouring Retry-After) before reporting, so a
 * transient rate-limit doesn't get logged as a hard failure.
 */
export async function checkLinkStatus(url: string): Promise<LinkStatusResult> {
  const first = await probeOnce(url);
  if (first.retryAfter === undefined) return first.result;
  await sleep(first.retryAfter);
  return (await probeOnce(url)).result;
}
