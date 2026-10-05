import { BadRequestException } from '@nestjs/common';
import { monthOf, monthsBetween, resolvePeriod } from './business-period';

describe('business period', () => {
  it('monthOf gives the first and last day, leap years included', () => {
    expect(monthOf('2026-10-05')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthOf('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('resolvePeriod defaults each missing date to the current month', () => {
    expect(resolvePeriod('2026-10-05', {})).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(resolvePeriod('2026-10-05', { from: '2026-09-15' })).toEqual({
      from: '2026-09-15',
      to: '2026-10-31',
    });
    expect(() => resolvePeriod('2026-10-05', { from: '2026-10-10', to: '2026-10-09' })).toThrow(
      BadRequestException,
    );
  });

  it('monthsBetween clips the first and last month and crosses years', () => {
    expect(monthsBetween('2026-11-15', '2027-01-10')).toEqual([
      { month: '2026-11', from: '2026-11-15', to: '2026-11-30' },
      { month: '2026-12', from: '2026-12-01', to: '2026-12-31' },
      { month: '2027-01', from: '2027-01-01', to: '2027-01-10' },
    ]);
    expect(monthsBetween('2026-10-05', '2026-10-05')).toEqual([
      { month: '2026-10', from: '2026-10-05', to: '2026-10-05' },
    ]);
  });
});
