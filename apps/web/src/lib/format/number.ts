const amountFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const quantityFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

/**
 * "2180.5" → "2,180.50". Decimal strings from the api are formatted directly as strings
 * (Intl accepts numeric strings), so no float arithmetic is involved.
 */
export function formatAmount(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return amountFormat.format(value as Intl.StringNumericLiteral);
}

/** "4.500" → "4.5" */
export function formatQuantity(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return quantityFormat.format(value as Intl.StringNumericLiteral);
}
