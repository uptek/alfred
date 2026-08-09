import { describe, expect, it } from 'bun:test';
import { isNavigable, normalizeUrl } from '../utils/url';

describe('isNavigable', () => {
  it('allows http and https', () => {
    expect(isNavigable('https://example.com/a')).toBe(true);
    expect(isNavigable('http://example.com/a')).toBe(true);
  });

  it('allows schemes the browser hands off to another app', () => {
    expect(isNavigable('mailto:hello@example.com')).toBe(true);
    expect(isNavigable('tel:+15551234567')).toBe(true);
    expect(isNavigable('sms:+15551234567')).toBe(true);
    expect(isNavigable('ftp://files.example.com/x.zip')).toBe(true);
    expect(isNavigable('whatsapp://send?text=hi')).toBe(true);
  });

  it('rejects script-bearing schemes', () => {
    expect(isNavigable('javascript:void(0)')).toBe(false);
    expect(isNavigable('vbscript:msgbox(1)')).toBe(false);
  });

  it('rejects schemes that would resolve against the extension or be blocked', () => {
    expect(isNavigable('data:text/html,<b>hi</b>')).toBe(false);
    expect(isNavigable('blob:https://example.com/9d1f-4c2a')).toBe(false);
    expect(isNavigable('filesystem:https://example.com/temporary/x')).toBe(false);
  });

  it('matches the scheme case-insensitively, as the URL parser normalizes it', () => {
    expect(isNavigable('JavaScript:void(0)')).toBe(false);
    expect(isNavigable('  javascript:void(0)')).toBe(false);
  });

  it('does not let a scheme hide behind a lookalike prefix', () => {
    expect(isNavigable('https://example.com/javascript:void(0)')).toBe(true);
    expect(isNavigable('https://example.com/?next=data:text/html,x')).toBe(true);
  });

  it('rejects anything the URL parser cannot read', () => {
    expect(isNavigable('')).toBe(false);
    expect(isNavigable('not a url')).toBe(false);
    expect(isNavigable('/relative/path')).toBe(false);
  });
});

describe('normalizeUrl', () => {
  it('drops the hash and lowercases the host', () => {
    expect(normalizeUrl('https://Example.COM/a#frag')).toBe('https://example.com/a');
  });

  it('trims trailing slashes but keeps the root', () => {
    expect(normalizeUrl('https://example.com/a/b///')).toBe('https://example.com/a/b');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('keeps the query', () => {
    expect(normalizeUrl('https://example.com/a/?q=1')).toBe('https://example.com/a?q=1');
  });

  it('returns null when unparseable', () => {
    expect(normalizeUrl('not a url')).toBeNull();
  });
});
