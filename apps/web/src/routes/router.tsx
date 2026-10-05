import { createBrowserRouter } from 'react-router';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { BookerLayout } from '@/components/layout/BookerLayout';
import { ComingSoonPage } from '@/components/layout/ComingSoonPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { BookerHomePage } from '@/features/booker/pages/BookerHomePage';
import { BookerOrderDetailsPage } from '@/features/booker/pages/BookerOrderDetailsPage';
import { BookerOrdersPage } from '@/features/booker/pages/BookerOrdersPage';
import { BookerShopsPage } from '@/features/booker/pages/BookerShopsPage';
import { BookOrderPage } from '@/features/booker/pages/BookOrderPage';
import { InvoiceDetailsPage } from '@/features/invoices/pages/InvoiceDetailsPage';
import { InvoiceFormPage } from '@/features/invoices/pages/InvoiceFormPage';
import { InvoicesPage } from '@/features/invoices/pages/InvoicesPage';
import { OrderDetailsPage } from '@/features/orders/pages/OrderDetailsPage';
import { OrdersPage } from '@/features/orders/pages/OrdersPage';
import { BookerProfilePage } from '@/features/booker/pages/BookerProfilePage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { ProductsPage } from '@/features/products/pages/ProductsPage';
import { ShopDetailsPage } from '@/features/shops/pages/ShopDetailsPage';
import { ShopsPage } from '@/features/shops/pages/ShopsPage';
import { PlatformHomePage } from '@/features/platform/pages/PlatformHomePage';
import { AreasPage } from '@/features/areas/pages/AreasPage';
import { SettingsLayout } from '@/features/settings/components/SettingsLayout';
import { ShopCategoriesPage } from '@/features/shop-categories/pages/ShopCategoriesPage';
import { OrganizationSettingsPage } from '@/features/settings/pages/OrganizationSettingsPage';
import { OrderBookersPage } from '@/features/users/pages/OrderBookersPage';
import { RedirectIfAuthenticated, RequireAuth, RequireRole, RoleHomeRedirect } from './guards';
import { NotFoundPage } from './NotFoundPage';

const adminPlaceholders = [
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
              { path: '/orders', element: <OrdersPage /> },
              { path: '/orders/:id', element: <OrderDetailsPage /> },
              { path: '/invoices', element: <InvoicesPage /> },
              { path: '/invoices/new', element: <InvoiceFormPage /> },
              { path: '/invoices/:id', element: <InvoiceDetailsPage /> },
              { path: '/shops/:shopId/invoices/new', element: <InvoiceFormPage /> },
              { path: '/shops', element: <ShopsPage /> },
              { path: '/shops/:id', element: <ShopDetailsPage /> },
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
              { path: 'shops', element: <BookerShopsPage /> },
              { path: 'shops/:shopId/order', element: <BookOrderPage /> },
              { path: 'orders', element: <BookerOrdersPage /> },
              { path: 'orders/:id', element: <BookerOrderDetailsPage /> },
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
