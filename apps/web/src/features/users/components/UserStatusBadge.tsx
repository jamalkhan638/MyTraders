import { type User } from '@mytraders/shared-types';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS } from '@/lib/permissions/roles';

export function UserStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? <Badge>Active</Badge> : <Badge variant="destructive">Inactive</Badge>;
}

export function UserRoleBadge({ role }: { role: User['role'] }) {
  return <Badge variant={role === 'ADMIN' ? 'secondary' : 'outline'}>{ROLE_LABELS[role]}</Badge>;
}
