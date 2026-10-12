import { INVOICE_STATUS_LABELS, type InvoiceStatus } from '@mytraders/shared-types';
import { Badge } from '@/components/ui/badge';

const VARIANT = { CONFIRMED: 'default', CANCELLED: 'destructive', VOIDED: 'muted' } as const;

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge variant={VARIANT[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>;
}
