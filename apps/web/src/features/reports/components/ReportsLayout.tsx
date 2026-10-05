import { NavLink, Outlet } from 'react-router';
import { cn } from '@/lib/utils';
import { REPORTS } from './report-list';

/** Reports section: one tab per report; the active report renders below. */
export function ReportsLayout() {
  return (
    <>
      <nav aria-label="Reports" className="mb-5 border-b print:hidden">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          <li>
            <NavLink to="/reports" end className={tabClass}>
              All reports
            </NavLink>
          </li>
          {REPORTS.map((report) => (
            <li key={report.to}>
              <NavLink to={report.to} className={tabClass}>
                {report.short}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </>
  );
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors',
    isActive
      ? 'border-primary text-primary'
      : 'border-transparent text-muted-foreground hover:text-foreground',
  );
