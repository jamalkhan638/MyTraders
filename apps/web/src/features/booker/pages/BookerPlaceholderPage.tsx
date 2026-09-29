import { Card, CardContent } from '@/components/ui/card';

/** Placeholder until the Order Booker flow is built (Phase 3). */
export function BookerPlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Coming in Phase 3.
        </CardContent>
      </Card>
    </div>
  );
}
