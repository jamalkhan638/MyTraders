import { DIRECT_SALE, UNASSIGNED } from '@mytraders/shared-types';

export interface Option {
  value: string;
  label: string;
}

/** Order booker filter: on sales the booker of the order ("Direct" = no order), on shops the assigned booker. */
export function bookerOptions(
  bookers: { id: string; name: string }[],
  kind: 'sales' | 'shops',
): Option[] {
  return [
    kind === 'sales'
      ? { value: DIRECT_SALE, label: 'Direct (no order)' }
      : { value: UNASSIGNED, label: 'Unassigned' },
    ...bookers.map((b) => ({ value: b.id, label: b.name })),
  ];
}

/** "Area: Saddar · Booker: Ali" — the active filters, for the print header and the CSV. */
export function describeFilters(pairs: [string, string | undefined | null | false][]): string {
  return pairs
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
}

/** Name of the selected option, for describeFilters. */
export function optionLabel(options: Option[], value: string): string | undefined {
  return value ? options.find((o) => o.value === value)?.label : undefined;
}
