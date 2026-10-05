import { BadRequestException } from '@nestjs/common';

/** First and last day of the calendar month of a business date ("2026-10-05" → 1st–31st Oct). */
export function monthOf(date: string): { from: string; to: string } {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

/**
 * A reporting period: the given dates, each defaulting to the current month of `today` (the
 * organization's business date). "To" before "From" is a 400 on `to`.
 */
export function resolvePeriod(
  today: string,
  query: { from?: string; to?: string },
): { from: string; to: string } {
  const month = monthOf(today);
  const from = query.from ?? month.from;
  const to = query.to ?? month.to;
  assertRange(from, to);
  return { from, to };
}

export function assertRange(from?: string, to?: string): void {
  if (from && to && from > to) {
    const message = '"To" must be on or after "From"';
    throw new BadRequestException({ message, details: [{ path: 'to', message }] });
  }
}

/** Calendar months overlapping [from, to], each clipped to the period, oldest first. */
export function monthsBetween(
  from: string,
  to: string,
): { month: string; from: string; to: string }[] {
  const result: { month: string; from: string; to: string }[] = [];
  let cursor = monthOf(from);
  while (cursor.from <= to) {
    result.push({
      month: cursor.from.slice(0, 7),
      from: cursor.from < from ? from : cursor.from,
      to: cursor.to > to ? to : cursor.to,
    });
    const next = new Date(`${cursor.to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = monthOf(next.toISOString().slice(0, 10));
  }
  return result;
}
