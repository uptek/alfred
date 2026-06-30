import { describe, expect, it } from 'bun:test';
import { bucketFor, retryAfterMs } from '../../background/linkStatus';

const headers = (retryAfter?: string) =>
  new Response(null, retryAfter === undefined ? {} : { headers: { 'Retry-After': retryAfter } });

describe('bucketFor', () => {
  it('maps 2xx to ok at both boundaries', () => {
    expect(bucketFor(200)).toBe('ok');
    expect(bucketFor(299)).toBe('ok');
  });

  it('maps 3xx to redirect at both boundaries', () => {
    expect(bucketFor(300)).toBe('redirect');
    expect(bucketFor(399)).toBe('redirect');
  });

  it('maps 4xx to client-error at both boundaries', () => {
    expect(bucketFor(400)).toBe('client-error');
    expect(bucketFor(404)).toBe('client-error');
    expect(bucketFor(499)).toBe('client-error');
  });

  it('maps 5xx to server-error', () => {
    expect(bucketFor(500)).toBe('server-error');
    expect(bucketFor(503)).toBe('server-error');
    expect(bucketFor(600)).toBe('server-error');
  });

  it('treats sub-200 and 0 (no status) as error', () => {
    expect(bucketFor(199)).toBe('error');
    expect(bucketFor(0)).toBe('error');
  });
});

describe('retryAfterMs', () => {
  it('parses a Retry-After given in seconds', () => {
    expect(retryAfterMs(headers('5'))).toBe(5000);
  });

  it('defaults to 2000ms when the header is missing', () => {
    expect(retryAfterMs(headers())).toBe(2000);
  });

  it('defaults to 2000ms when the header is unparseable', () => {
    expect(retryAfterMs(headers('soon'))).toBe(2000);
  });

  it('clamps a negative delay to 0', () => {
    expect(retryAfterMs(headers('-5'))).toBe(0);
  });

  it('clamps an over-large delay to the 8000ms cap', () => {
    expect(retryAfterMs(headers('999'))).toBe(8000);
  });

  it('handles an HTTP-date in the past as 0', () => {
    expect(retryAfterMs(headers('Wed, 01 Jan 2020 00:00:00 GMT'))).toBe(0);
  });

  it('clamps a far-future HTTP-date to the 8000ms cap', () => {
    expect(retryAfterMs(headers('Wed, 01 Jan 2031 00:00:00 GMT'))).toBe(8000);
  });
});
