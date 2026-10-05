import {
  Banknote,
  ChartColumn,
  CreditCard,
  FileText,
  type LucideIcon,
  Package,
  ReceiptText,
  Store,
} from 'lucide-react';

export interface ReportLink {
  to: string;
  title: string;
  short: string;
  description: string;
  icon: LucideIcon;
  tone: string;
}

export const REPORTS: ReportLink[] = [
  {
    to: '/reports/sales',
    title: 'Sales report',
    short: 'Sales',
    description: 'Confirmed invoices by date with Payable Value and weight sold.',
    icon: ChartColumn,
    tone: 'bg-violet-50 text-violet-600',
  },
  {
    to: '/reports/invoices',
    title: 'Invoice report',
    short: 'Invoices',
    description: 'Every invoice with taxes, ADT discount, Payable Value and status.',
    icon: FileText,
    tone: 'bg-blue-50 text-blue-600',
  },
  {
    to: '/reports/shop-credit',
    title: 'Shop credit report',
    short: 'Shop credit',
    description: 'Outstanding balance per shop, last payment and last invoice.',
    icon: CreditCard,
    tone: 'bg-amber-50 text-amber-600',
  },
  {
    to: '/reports/product-sales',
    title: 'Product sales report',
    short: 'Product sales',
    description: 'Quantity, weight, sales value, cost and profit per product.',
    icon: Package,
    tone: 'bg-emerald-50 text-emerald-700',
  },
  {
    to: '/reports/expenses',
    title: 'Expense report',
    short: 'Expenses',
    description: 'Expenses by date and category; voided ones never count.',
    icon: ReceiptText,
    tone: 'bg-red-50 text-red-600',
  },
  {
    to: '/reports/profit',
    title: 'Profit report',
    short: 'Profit',
    description: 'Payable Value, product cost, gross profit, expenses and net profit.',
    icon: Banknote,
    tone: 'bg-emerald-50 text-emerald-700',
  },
  {
    to: '/reports/shops',
    title: 'Shop list',
    short: 'Shop list',
    description: 'Area-wise shop list with contact details and current outstanding.',
    icon: Store,
    tone: 'bg-blue-50 text-blue-600',
  },
];
