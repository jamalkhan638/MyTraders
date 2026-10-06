import {
  BarChart3,
  Building2,
  BookOpenText,
  ClipboardList,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Settings,
  Store,
  Users,
  Wallet,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** active only on this exact path (for a section home such as /platform) */
  end?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/** Admin sidebar — docs/frontend-guidelines.md §5. */
export const ADMIN_NAV: NavGroup[] = [
  { items: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }] },
  {
    label: 'Sales',
    items: [
      { label: 'Orders', to: '/orders', icon: ClipboardList },
      { label: 'Invoices', to: '/invoices', icon: FileText },
    ],
  },
  {
    label: 'Finance',
    items: [{ label: 'Area Ledger', to: '/finance/area-ledger', icon: BookOpenText }],
  },
  {
    items: [
      { label: 'Shops', to: '/shops', icon: Store },
      { label: 'Products', to: '/products', icon: Package },
      { label: 'Expenses', to: '/expenses', icon: Wallet },
      { label: 'Reports', to: '/reports', icon: BarChart3 },
      { label: 'Order Bookers', to: '/order-bookers', icon: Users },
      { label: 'Settings', to: '/settings', icon: Settings },
    ],
  },
];

/** Super Admin sidebar — platform tenant management only (D-38). */
export const PLATFORM_NAV: NavGroup[] = [
  {
    items: [
      { label: 'Overview', to: '/platform', icon: LayoutDashboard, end: true },
      { label: 'Tenants', to: '/platform/tenants', icon: Building2 },
    ],
  },
];
