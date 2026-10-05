import { INVOICE_STATUS_LABELS, type InvoiceStatus } from '@mytraders/shared-types';
import { Badge } from '@/components/ui/badge';

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge variant={status === 'CANCELLED' ? 'destructive' : 'default'}>
      {INVOICE_STATUS_LABELS[status]}
    </Badge>
  );
}
