import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { OrganizationSettingsForm } from '../components/OrganizationSettingsForm';
import { useOrganizationSettings } from '../hooks/useOrganizationSettings';

export function OrganizationSettingsPage() {
  const settings = useOrganizationSettings();
  return (
    <div className="max-w-4xl">
      {settings.isPending ? (
        <Card>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ) : settings.isError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            Could not load settings.
          </CardContent>
        </Card>
      ) : (
        <OrganizationSettingsForm settings={settings.data} />
      )}
    </div>
  );
}
