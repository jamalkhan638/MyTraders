import { type AuthUser } from '@mytraders/shared-types';
import { ROLE_LABELS } from '@/lib/permissions/roles';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function UserBadge({ user }: { user: AuthUser }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
        {initials(user.name)}
      </span>
      <span className="hidden text-left leading-tight sm:block">
        <span className="block text-sm font-medium">{user.name}</span>
        <span className="block text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
      </span>
    </div>
  );
}
