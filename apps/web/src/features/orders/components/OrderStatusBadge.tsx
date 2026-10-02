import { ORDER_STATUS_LABELS, type OrderStatus } from '@mytraders/shared-types';
import { Badge } from '@/components/ui/badge';

const VARIANT = { PENDING: 'warning', INVOICED: 'default', CANCELLED: 'muted' } as const;

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={VARIANT[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}
