import { ClipboardList, Store } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCurrentUser } from '@/features/auth/auth-context';
import { useOrders } from '@/features/orders/hooks/useOrders';
import { useMyAreas } from '../hooks/useBooker';

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function BookerHomePage() {
  const user = useCurrentUser();
  const areas = useMyAreas();
  const pending = useOrders({ status: 'PENDING', pageSize: 1 });
  const shopCount = areas.data?.reduce((sum, area) => sum + area.shopCount, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">
          {greeting()}, {user.name.split(' ')[0]}
        </h1>
        <p className="text-sm text-muted-foreground">{user.organization?.name}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="My shops" value={shopCount} />
        <Stat label="Pending orders" value={pending.data?.total} />
      </div>
      <Button asChild size="lg" className="w-full">
        <Link to="/booker/shops">
          <Store />
          Book an order
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="w-full">
        <Link to="/booker/orders">
          <ClipboardList />
          My orders
        </Link>
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <div className="text-2xl font-semibold tabular-nums">{value ?? '–'}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
