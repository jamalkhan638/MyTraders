import { Construction } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from './PageHeader';

/** Placeholder for navigation items whose module is not built yet (see docs/implementation-plan.md). */
export function ComingSoonPage({ title, phase }: { title: string; phase: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Construction className="size-8 text-muted-foreground" />
          <p className="font-medium">Coming in {phase}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            This module is part of a later phase of the implementation plan.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
