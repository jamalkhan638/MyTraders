import { Store } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCurrentUser } from '@/features/auth/auth-context';

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function BookerHomePage() {
  const user = useCurrentUser();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">
          {greeting()}, {user.name.split(' ')[0]}
        </h1>
        <p className="text-sm text-muted-foreground">{user.organization?.name}</p>
      </div>
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Your assigned shops will appear here.</p>
          <Button asChild size="lg" className="w-full">
            <Link to="/booker/shops">
              <Store />
              My Shops
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
