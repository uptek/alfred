import { describe, expect, it } from 'bun:test';
import { formatAppAge, formatDetailedAppAge } from '../appListing';

const NOW = new Date('2026-08-09T12:00:00Z');

describe('formatAppAge', () => {
  it('returns undefined for unparseable dates', () => {
    expect(formatAppAge('not a date', NOW)).toBeUndefined();
    expect(formatAppAge('', NOW)).toBeUndefined();
  });

  it('returns undefined for future dates', () => {
    expect(formatAppAge('2026-09-01', NOW)).toBeUndefined();
  });

  it('formats day zero as Today', () => {
    expect(formatAppAge('2026-08-09T00:00:00Z', NOW)).toBe('Today');
  });

  it('formats days within the launch month', () => {
    expect(formatAppAge('2026-08-08T00:00:00Z', NOW)).toBe('1 day');
    expect(formatAppAge('2026-08-01T00:00:00Z', NOW)).toBe('8 days');
  });

  it('counts days across a month boundary until a full month has passed', () => {
    expect(formatAppAge('2026-07-25T00:00:00Z', NOW)).toBe('15 days');
    expect(formatAppAge('2026-07-10T00:00:00Z', NOW)).toBe('30 days');
    expect(formatAppAge('2026-07-09T00:00:00Z', NOW)).toBe('1 month');
  });

  it('counts a year only once the anniversary has passed', () => {
    expect(formatAppAge('2025-08-10', NOW)).toBe('11 months');
  });

  it('formats calendar months under a year', () => {
    expect(formatAppAge('2026-07-09', NOW)).toBe('1 month');
    expect(formatAppAge('2025-09-09', NOW)).toBe('11 months');
  });

  it('formats whole years without a decimal', () => {
    expect(formatAppAge('2025-08-09', NOW)).toBe('1 year');
    expect(formatAppAge('2024-08-09', NOW)).toBe('2 years');
  });

  it('formats partial years with one decimal', () => {
    expect(formatAppAge('2025-02-09', NOW)).toBe('1.5 years');
    expect(formatAppAge('2015-11-09', NOW)).toBe('10.8 years');
  });
});

describe('formatDetailedAppAge', () => {
  it('returns undefined for unparseable and future dates', () => {
    expect(formatDetailedAppAge('not a date', NOW)).toBeUndefined();
    expect(formatDetailedAppAge('2026-09-01', NOW)).toBeUndefined();
  });

  it('formats days only', () => {
    expect(formatDetailedAppAge('2026-08-09T00:00:00Z', NOW)).toBe('0 days');
    expect(formatDetailedAppAge('2026-07-25T00:00:00Z', NOW)).toBe('15 days');
  });

  it('drops zero components', () => {
    expect(formatDetailedAppAge('2026-07-09T00:00:00Z', NOW)).toBe('1 month');
    expect(formatDetailedAppAge('2025-08-09', NOW)).toBe('1 year');
  });

  it('formats full year, month, day breakdowns', () => {
    expect(formatDetailedAppAge('2025-06-20T00:00:00Z', NOW)).toBe('1 year, 1 month, 20 days');
    expect(formatDetailedAppAge('2024-02-01T00:00:00Z', NOW)).toBe('2 years, 6 months, 8 days');
  });

  it('agrees with formatAppAge at the month boundary', () => {
    // Both formatters share calendarAge, so "1 month" short can never pair
    // with a "0 months, 30 days" detailed value.
    expect(formatAppAge('2026-07-09T00:00:00Z', NOW)).toBe('1 month');
    expect(formatDetailedAppAge('2026-07-09T00:00:00Z', NOW)).toBe('1 month');
    expect(formatAppAge('2026-07-10T00:00:00Z', NOW)).toBe('30 days');
    expect(formatDetailedAppAge('2026-07-10T00:00:00Z', NOW)).toBe('30 days');
  });
});
