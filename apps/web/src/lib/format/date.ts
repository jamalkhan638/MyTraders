/** Formats an ISO timestamp in the organization's timezone, e.g. "29 Sep 2026, 11:40". */
export function formatDateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Formats an ISO timestamp as a date in the organization's timezone, e.g. "29 Sep 2026". */
export function formatDate(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}
