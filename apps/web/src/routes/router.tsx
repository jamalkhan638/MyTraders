import { createBrowserRouter } from 'react-router';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { BookerLayout } from '@/components/layout/BookerLayout';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { BookerHomePage } from '@/features/booker/pages/BookerHomePage';
import { BookerOrderDetailsPage } from '@/features/booker/pages/BookerOrderDetailsPage';
import { BookerOrdersPage } from '@/features/booker/pages/BookerOrdersPage';
import { BookerShopsPage } from '@/features/booker/pages/BookerShopsPage';
import { BookOrderPage } from '@/features/booker/pages/BookOrderPage';
import { InvoiceDetailsPage } from '@/features/invoices/pages/InvoiceDetailsPage';
import { InvoiceFormPage } from '@/features/invoices/pages/InvoiceFormPage';
import { InvoicesPage } from '@/features/invoices/pages/InvoicesPage';
import { AreaLedgerPage } from '@/features/ledger/pages/AreaLedgerPage';
import { OrderDetailsPage } from '@/features/orders/pages/OrderDetailsPage';
import { OrdersPage } from '@/features/orders/pages/OrdersPage';
import { BookerProfilePage } from '@/features/booker/pages/BookerProfilePage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { ProductsPage } from '@/features/products/pages/ProductsPage';
import { ReportsLayout } from '@/features/reports/components/ReportsLayout';
import { ExpenseReportPage } from '@/features/reports/pages/ExpenseReportPage';
import { InvoiceReportPage } from '@/features/reports/pages/InvoiceReportPage';
import { ProductSalesReportPage } from '@/features/reports/pages/ProductSalesReportPage';
import { ProfitReportPage } from '@/features/reports/pages/ProfitReportPage';
import { ReportsHomePage } from '@/features/reports/pages/ReportsHomePage';
import { SalesReportPage } from '@/features/reports/pages/SalesReportPage';
import { ShopCreditReportPage } from '@/features/reports/pages/ShopCreditReportPage';
import { ShopListReportPage } from '@/features/reports/pages/ShopListReportPage';
import { ShopDetailsPage } from '@/features/shops/pages/ShopDetailsPage';
import { ShopsPage } from '@/features/shops/pages/ShopsPage';
import { PlatformHomePage } from '@/features/platform/pages/PlatformHomePage';
import { AreasPage } from '@/features/areas/pages/AreasPage';
import { SettingsLayout } from '@/features/settings/components/SettingsLayout';
import { ShopCategoriesPage } from '@/features/shop-categories/pages/ShopCategoriesPage';
import { ExpenseCategoriesPage } from '@/features/expense-categories/pages/ExpenseCategoriesPage';
import { ExpensesPage } from '@/features/expenses/pages/ExpensesPage';
import { OrganizationSettingsPage } from '@/features/settings/pages/OrganizationSettingsPage';
import { OrderBookersPage } from '@/features/users/pages/OrderBookersPage';
import { RedirectIfAuthenticated, RequireAuth, RequireRole, RoleHomeRedirect } from './guards';
import { NotFoundPage } from './NotFoundPage';

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
              { path: '/finance/area-ledger', element: <AreaLedgerPage /> },
              { path: '/expenses', element: <ExpensesPage /> },
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
                  { path: 'expense-categories', element: <ExpenseCategoriesPage /> },
                ],
              },
              {
                path: '/reports',
                element: <ReportsLayout />,
                children: [
                  { index: true, element: <ReportsHomePage /> },
                  { path: 'sales', element: <SalesReportPage /> },
                  { path: 'invoices', element: <InvoiceReportPage /> },
                  { path: 'shop-credit', element: <ShopCreditReportPage /> },
                  { path: 'product-sales', element: <ProductSalesReportPage /> },
                  { path: 'expenses', element: <ExpenseReportPage /> },
                  { path: 'profit', element: <ProfitReportPage /> },
                  { path: 'shops', element: <ShopListReportPage /> },
                ],
              },
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
