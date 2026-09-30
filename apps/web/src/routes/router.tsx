import { createBrowserRouter } from 'react-router';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { BookerLayout } from '@/components/layout/BookerLayout';
import { ComingSoonPage } from '@/components/layout/ComingSoonPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { BookerHomePage } from '@/features/booker/pages/BookerHomePage';
import { BookerPlaceholderPage } from '@/features/booker/pages/BookerPlaceholderPage';
import { BookerProfilePage } from '@/features/booker/pages/BookerProfilePage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { ProductsPage } from '@/features/products/pages/ProductsPage';
import { PlatformHomePage } from '@/features/platform/pages/PlatformHomePage';
import { AreasPage } from '@/features/areas/pages/AreasPage';
import { SettingsLayout } from '@/features/settings/components/SettingsLayout';
import { ShopCategoriesPage } from '@/features/shop-categories/pages/ShopCategoriesPage';
import { OrganizationSettingsPage } from '@/features/settings/pages/OrganizationSettingsPage';
import { OrderBookersPage } from '@/features/users/pages/OrderBookersPage';
import { RedirectIfAuthenticated, RequireAuth, RequireRole, RoleHomeRedirect } from './guards';
import { NotFoundPage } from './NotFoundPage';

const adminPlaceholders = [
  { path: 'orders', title: 'Orders', phase: 'Phase 3' },
  { path: 'invoices', title: 'Invoices', phase: 'Phase 4' },
  { path: 'shops', title: 'Shops', phase: 'Phase 2' },
  { path: 'expenses', title: 'Expenses', phase: 'Phase 6' },
  { path: 'reports', title: 'Reports', phase: 'Phase 7' },
];

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthenticated />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      { index: true, element: <RoleHomeRedirect /> },
      {
        element: <RequireRole roles={['ADMIN']} />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { path: '/dashboard', element: <DashboardPage /> },
              { path: '/products', element: <ProductsPage /> },
              { path: '/order-bookers', element: <OrderBookersPage /> },
              {
                path: '/settings',
                element: <SettingsLayout />,
                children: [
                  { index: true, element: <OrganizationSettingsPage /> },
                  { path: 'areas', element: <AreasPage /> },
                  { path: 'shop-categories', element: <ShopCategoriesPage /> },
                ],
              },
              ...adminPlaceholders.map(({ path, title, phase }) => ({
                path: `/${path}`,
                element: <ComingSoonPage title={title} phase={phase} />,
              })),
            ],
          },
        ],
      },
      {
        element: <RequireRole roles={['ORDER_BOOKER']} />,
        children: [
          {
            path: '/booker',
            element: <BookerLayout />,
            children: [
              { index: true, element: <BookerHomePage /> },
              { path: 'shops', element: <BookerPlaceholderPage title="My Shops" /> },
              { path: 'orders', element: <BookerPlaceholderPage title="My Orders" /> },
              { path: 'profile', element: <BookerProfilePage /> },
            ],
          },
        ],
      },
      {
        element: <RequireRole roles={['SUPER_ADMIN']} />,
        children: [{ path: '/platform', element: <PlatformHomePage /> }],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
