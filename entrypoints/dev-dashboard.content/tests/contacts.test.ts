import { describe, expect, it } from 'bun:test';
import { internationalNumber } from '../contacts';

describe('internationalNumber', () => {
  it('keeps numbers that carry a country code', () => {
    expect(internationalNumber('+92 300 1234567', 'Pakistan')).toBe('923001234567');
    expect(internationalNumber('0044 20 7946 0958', 'Pakistan')).toBe('442079460958');
    expect(internationalNumber('923001234567', 'Pakistan')).toBe('923001234567');
  });

  it('adds the country code to national numbers', () => {
    expect(internationalNumber('9205361992', 'India')).toBe('919205361992');
    expect(internationalNumber('(212) 555-1234', 'United States')).toBe('12125551234');
  });

  it('drops the trunk 0, except in Italy', () => {
    expect(internationalNumber('03001234567', 'Pakistan')).toBe('923001234567');
    expect(internationalNumber('3491234567', 'Italy')).toBe('393491234567');
    expect(internationalNumber('0612345678', 'Italy')).toBe('390612345678');
  });

  it('matches qualified country names', () => {
    expect(internationalNumber('91234567', 'Hong Kong SAR')).toBe('85291234567');
  });

  it('gives up on a national number from an unknown country', () => {
    expect(internationalNumber('3001234567', '')).toBeUndefined();
    expect(internationalNumber('3001234567', 'Atlantis')).toBeUndefined();
  });
});
