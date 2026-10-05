import { NavLink, Outlet } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'Organization', to: '/settings', end: true },
  { label: 'Areas', to: '/settings/areas', end: false },
  { label: 'Shop Categories', to: '/settings/shop-categories', end: false },
  { label: 'Expense Categories', to: '/settings/expense-categories', end: false },
];

/** Settings section with tabs (docs/frontend-guidelines.md §5: Settings → Organization, Areas, Shop Categories, …). */
export function SettingsLayout() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Company details and the lists your team works with."
      />
      <nav aria-label="Settings sections" className="mb-6 border-b">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    'inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </>
  );
}
