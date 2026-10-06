import { describe, expect, it } from 'bun:test';
import { bucketFor, retryAfterMs } from '../../background/linkStatus';

describe('bucketFor', () => {
  it.each([
    ['ok', [200, 299]],
    ['redirect', [300, 399]],
    ['client-error', [400, 499]],
    ['server-error', [500, 600]],
    ['error', [199, 0]] // sub-200 and 0 (no status)
  ])('maps to %s at %j', (bucket, statuses) => {
    for (const status of statuses) expect(bucketFor(status)).toBe(bucket);
  });
});

describe('retryAfterMs', () => {
  it.each([
    ['parses a delay in seconds', '5', 5000],
    ['defaults when the header is missing', undefined, 2000],
    ['defaults when the header is unparseable', 'soon', 2000],
    ['clamps a negative delay to 0', '-5', 0],
    ['clamps an over-large delay to the cap', '999', 8000],
    ['treats an HTTP-date in the past as 0', 'Wed, 01 Jan 2020 00:00:00 GMT', 0],
    ['clamps a far-future HTTP-date to the cap', 'Wed, 01 Jan 2031 00:00:00 GMT', 8000]
  ])('%s', (_, retryAfter, ms) => {
    const headers = retryAfter === undefined ? {} : { 'Retry-After': retryAfter };
    expect(retryAfterMs(new Response(null, { headers }))).toBe(ms);
  });
});
