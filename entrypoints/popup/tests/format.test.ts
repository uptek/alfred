import { describe, expect, it, test } from 'bun:test';
import { csvField, formatSize } from '../utils/format';

describe('csvField', () => {
  it('quotes plain values', () => {
    expect(csvField('hello')).toBe('"hello"');
  });

  it('stringifies non-string values', () => {
    expect(csvField(true)).toBe('"true"');
  });

  it('escapes embedded quotes by doubling them', () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('neutralizes formula-leading characters for spreadsheet safety', () => {
    expect(csvField('=SUM(A1:A9)')).toBe('"\'=SUM(A1:A9)"');
    expect(csvField('+1234')).toBe('"\'+1234"');
    expect(csvField('-cmd')).toBe('"\'-cmd"');
    expect(csvField('@import')).toBe('"\'@import"');
  });

  it('neutralizes leading tab and CR (spreadsheets strip them before formula detection)', () => {
    expect(csvField('\t=SUM(A1)')).toBe('"\'\t=SUM(A1)"');
    expect(csvField('\r-cmd')).toBe('"\'\r-cmd"');
  });

  it('leaves values that merely contain formula characters alone', () => {
    expect(csvField('a=b')).toBe('"a=b"');
  });
});

describe('formatSize', () => {
  test('bytes under 1 KB', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  test('kilobytes with one decimal', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
  });

  test('megabytes with one decimal', () => {
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  test('values that would round up to 1024.0 KB roll over to MB', () => {
    expect(formatSize(1024 * 1024 - 1)).toBe('1.0 MB');
  });
});
