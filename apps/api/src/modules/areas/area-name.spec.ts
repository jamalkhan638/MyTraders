import { cleanName, normalizeName } from '@mytraders/shared-types';

describe('name normalization', () => {
  it('cleans display names', () => {
    expect(cleanName('  University    Road ')).toBe('University Road');
  });

  it('builds a case/space-insensitive comparison key', () => {
    expect(normalizeName('  SADDAR ')).toBe('saddar');
    expect(normalizeName('Board\tBazaar')).toBe(normalizeName('board bazaar'));
  });
});
