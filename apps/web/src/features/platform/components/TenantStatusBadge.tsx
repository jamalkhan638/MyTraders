import { type OrganizationStatus } from '@mytraders/shared-types';
import { Badge } from '@/components/ui/badge';

const STATUS: Record<
  OrganizationStatus,
  { label: string; variant: 'default' | 'destructive' | 'warning' }
> = {
  ACTIVE: { label: 'Active', variant: 'default' },
  SUSPENDED: { label: 'Suspended', variant: 'destructive' },
  TRIAL: { label: 'Trial', variant: 'warning' },
};

export function TenantStatusBadge({ status }: { status: OrganizationStatus }) {
  const { label, variant } = STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}
