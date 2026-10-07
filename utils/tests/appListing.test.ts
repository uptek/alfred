import { describe, expect, it } from 'bun:test';
import { formatAppAge, formatDetailedAppAge } from '../appListing';

const NOW = new Date('2026-08-09T12:00:00Z');

describe('formatAppAge / formatDetailedAppAge', () => {
  // Both formatters share calendarAge, so a "1 month" short age never pairs
  // with a "0 months, 30 days" detailed one.
  it.each([
    ['not a date', undefined, undefined],
    ['', undefined, undefined],
    ['2026-09-01', undefined, undefined],
    ['2026-08-09T00:00:00Z', 'Today', '0 days'],
    ['2026-08-08T00:00:00Z', '1 day', '1 day'],
    ['2026-08-01T00:00:00Z', '8 days', '8 days'],
    // Days across a month boundary count as days until a full month has passed.
    ['2026-07-25T00:00:00Z', '15 days', '15 days'],
    ['2026-07-10T00:00:00Z', '30 days', '30 days'],
    ['2026-07-09T00:00:00Z', '1 month', '1 month'],
    // A year counts only once the anniversary has passed.
    ['2025-08-10', '11 months', '11 months, 30 days'],
    ['2025-09-09', '11 months', '11 months'],
    ['2025-08-09', '1 year', '1 year'],
    ['2024-08-09', '2 years', '2 years'],
    ['2025-02-09', '1.5 years', '1 year, 6 months'],
    ['2015-11-09', '10.8 years', '10 years, 9 months'],
    ['2025-06-20T00:00:00Z', '1.1 years', '1 year, 1 month, 20 days'],
    ['2024-02-01T00:00:00Z', '2.5 years', '2 years, 6 months, 8 days']
  ])('%p is %p, or %p in detail', (launch, short, detailed) => {
    expect(formatAppAge(launch, NOW)).toBe(short);
    expect(formatDetailedAppAge(launch, NOW)).toBe(detailed);
  });

  it('clamps month-end anniversaries to the target month', () => {
    // Jan 31 + 1 month is Feb 28, not Mar 3, so Mar 30 is 30 leftover days.
    expect(formatDetailedAppAge('2026-01-31T00:00:00Z', new Date('2026-03-30T00:00:00Z'))).toBe('1 month, 30 days');
    expect(formatDetailedAppAge('2026-01-31T00:00:00Z', new Date('2026-03-01T00:00:00Z'))).toBe('1 month, 1 day');
    // Mar 31 + 1 month is Apr 30, not May 1, which would shave a day off.
    expect(formatDetailedAppAge('2026-03-31T00:00:00Z', new Date('2026-05-30T00:00:00Z'))).toBe('1 month, 30 days');
  });
});
