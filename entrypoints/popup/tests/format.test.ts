import { describe, expect, test } from 'bun:test';
import { formatSize } from '../utils/format';

describe('formatSize', () => {
  test.each([
    [512, '512 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [2048, '2.0 KB'],
    // Values that would round up to 1024.0 KB roll over to MB
    [1024 * 1024 - 1, '1.0 MB'],
    [1.5 * 1024 * 1024, '1.5 MB'],
    [2 * 1024 * 1024, '2.0 MB']
  ])('formats %p bytes as %p', (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });
});
