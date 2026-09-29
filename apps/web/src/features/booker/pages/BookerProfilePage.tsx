import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth, useCurrentUser } from '@/features/auth/auth-context';
import { ROLE_LABELS } from '@/lib/permissions/roles';

export function BookerProfilePage() {
  const user = useCurrentUser();
  const { signOut } = useAuth();
  const rows = [
    ['Name', user.name],
    ['Email', user.email],
    ['Role', ROLE_LABELS[user.role]],
    ['Company', user.organization?.name ?? '—'],
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Profile</h1>
      <Card>
        <CardContent>
          <dl className="divide-y">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2.5 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Button variant="outline" size="lg" className="w-full" onClick={() => void signOut()}>
        <LogOut />
        Sign out
      </Button>
    </div>
  );
}
