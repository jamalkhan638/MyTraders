import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth, useCurrentUser } from '@/features/auth/auth-context';

/** Super Admin landing. The platform module (organizations, status, usage) comes in Phase 9. */
export function PlatformHomePage() {
  const user = useCurrentUser();
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Platform administration</CardTitle>
          <CardDescription>
            Signed in as {user.email}. Organization management arrives in Phase 9.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
