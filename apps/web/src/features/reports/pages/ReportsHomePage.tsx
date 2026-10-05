import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { REPORTS } from '../components/report-list';

/** Reports index: one card per report. */
export function ReportsHomePage() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Filter, print or download each report as CSV for Excel. Figures use the same rules as the dashboard."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((report) => (
          <Card key={report.to} className="py-0 transition-colors hover:border-primary/40">
            <Link
              to={report.to}
              className="block rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
            >
              <CardContent className="flex items-start gap-3.5 px-5 py-4">
                <span
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[22px]',
                    report.tone,
                  )}
                  aria-hidden
                >
                  <report.icon />
                </span>
                <div className="min-w-0">
                  <div className="font-medium">{report.title}</div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{report.description}</p>
                </div>
              </CardContent>
            </Link>
          </Card>
        ))}
      </div>
    </>
  );
}
