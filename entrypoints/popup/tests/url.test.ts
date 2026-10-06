import { describe, expect, test } from 'bun:test';
import { isNavigable, normalizeUrl } from '../utils/url';

describe('isNavigable', () => {
  test.each([
    'https://example.com/a',
    'http://example.com/a',
    // Schemes the browser hands off to another app
    'mailto:hello@example.com',
    'tel:+15551234567',
    'sms:+15551234567',
    'ftp://files.example.com/x.zip',
    'whatsapp://send?text=hi',
    // A scheme cannot hide behind a lookalike prefix
    'https://example.com/javascript:void(0)',
    'https://example.com/?next=data:text/html,x'
  ])('allows %p', (url) => {
    expect(isNavigable(url)).toBe(true);
  });

  test.each([
    // Script-bearing schemes
    'javascript:void(0)',
    'vbscript:msgbox(1)',
    // Schemes that would resolve against the extension or be blocked
    'data:text/html,<b>hi</b>',
    'blob:https://example.com/9d1f-4c2a',
    'filesystem:https://example.com/temporary/x',
    // The URL parser normalizes the scheme's case and surrounding whitespace
    'JavaScript:void(0)',
    '  javascript:void(0)',
    // Anything the URL parser cannot read
    '',
    'not a url',
    '/relative/path'
  ])('rejects %p', (url) => {
    expect(isNavigable(url)).toBe(false);
  });
});

describe('normalizeUrl', () => {
  test.each([
    ['https://Example.COM/a#frag', 'https://example.com/a'],
    ['https://example.com/a/b///', 'https://example.com/a/b'],
    ['https://example.com/', 'https://example.com/'],
    ['https://example.com/a/?q=1', 'https://example.com/a?q=1'],
    ['not a url', null]
  ])('normalizes %p to %p', (url, expected) => {
    expect(normalizeUrl(url)).toBe(expected);
  });
});
