import { ClipboardList, Home, Store, User } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { useCurrentUser } from '@/features/auth/auth-context';
import { cn } from '@/lib/utils';

const BOOKER_NAV = [
  { label: 'Home', to: '/booker', icon: Home, end: true },
  { label: 'My Shops', to: '/booker/shops', icon: Store, end: false },
  { label: 'My Orders', to: '/booker/orders', icon: ClipboardList, end: false },
  { label: 'Profile', to: '/booker/profile', icon: User, end: false },
];

/** Mobile-first Order Booker shell with a bottom navigation bar (docs/frontend-guidelines.md §5–6). */
export function BookerLayout() {
  const user = useCurrentUser();

  return (
    <div className="mx-auto flex min-h-svh max-w-screen-sm flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2.5 border-b bg-card px-4">
        <img src="/favicon.svg" alt="" className="size-7" />
        <div className="leading-tight">
          <div className="text-sm font-semibold">MyTraders</div>
          <div className="text-xs text-muted-foreground">{user.organization?.name}</div>
        </div>
      </header>

      <main className="flex-1 px-4 pt-4 pb-24">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-screen-sm border-t bg-card pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-4">
          {BOOKER_NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )
                }
              >
                <item.icon className="size-5" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
