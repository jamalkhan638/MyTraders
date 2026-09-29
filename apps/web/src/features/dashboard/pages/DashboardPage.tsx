import { CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '@/features/auth/auth-context';

/** Phase 1 placeholder. Metric cards arrive with the Dashboard module (Phase 6). */
export function DashboardPage() {
  const user = useCurrentUser();
  return (
    <>
      <PageHeader title="Dashboard" description={`Welcome back, ${user.name}.`} />
      <Card>
        <CardHeader>
          <CardTitle>Platform foundation is ready</CardTitle>
          <CardDescription>
            Business metrics (pending orders, market credit, sales, weight sold, expenses, net
            profit) will appear here once those modules are built.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {['Signed in securely', 'Organization data isolated', 'Role-based access active'].map(
              (item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary" />
                  {item}
                </li>
              ),
            )}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
