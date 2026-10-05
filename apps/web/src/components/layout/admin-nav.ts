import {
  BarChart3,
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
