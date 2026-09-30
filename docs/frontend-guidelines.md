# Frontend Guidelines (apps/web)

## 1. Structure (feature-based)

```
apps/web/src/
  app/                    # providers (QueryClient, Router, Auth), App.tsx
  routes/                 # route tree, role guards, layouts wiring
  components/
    ui/                   # shadcn/ui generated components
    layout/               # AdminLayout (sidebar), BookerLayout (bottom nav), PageHeader
    data-table/           # TanStack Table wrapper (sorting, pagination, empty/loading states)
    money/                # <Money>, <Weight> formatters
  features/
    auth/  dashboard/  areas/  products/  shops/  orders/
    invoices/  ledger/  expenses/  reports/  users/  settings/
    booker/               # Order Booker mobile screens
  lib/
    api/                  # fetch client, token refresh, error normalization
    auth/                 # in-memory token store, useAuth
    permissions/          # role helpers (UX only)
    format/               # currency / date / weight formatting (org currency + timezone)
```

Feature folder:
```
features/products/
  api/products.api.ts         # typed calls using @mytraders/shared-types
  hooks/useProducts.ts        # TanStack Query hooks + query keys
  components/ProductTable.tsx
  components/ProductForm.tsx
  pages/ProductsPage.tsx
  schemas/product.schema.ts   # re-export / extend shared zod schema for the form
```

## 2. Rules

- **Server state = TanStack Query.** No duplicated server data in global stores. Query keys per feature (`['products', filters]`).
- **Forms = React Hook Form + zod** (schemas from `@mytraders/shared-types`, so frontend and backend validate identically).
- **Money is a string from the API.** Display via `<Money>`; live math uses the shared `decimal.js` calculators, never `Number`.
- Frontend totals are UX only; after confirm, show what the server returned.
- Permissions on the frontend only hide/show UI; never assume they protect data.
- Don't build abstractions before the second use.

## 3. UI patterns

| Use | For |
|---|---|
| **Table** (desktop) | Areas, Products, Shops, Orders, Invoices, Expenses, Users |
| **Cards** | Dashboard metrics, booker shop list, booker order flow, tables collapsed on mobile |
| **Dialog** | Add/Edit Area, Add Expense, Add Credit, Receive Payment, confirmations |
| **Right drawer (Sheet)** | Add/Edit Product, Add/Edit Shop, Add/Edit User |
| **Full page** | Shop details, Invoice form, Invoice view/print, Reports |

Every list has loading skeleton, empty state, error state. Destructive/financial actions ask for confirmation.

## 4. Theme

- Primary: deep green (`#15803d` / hover `#166534`) for primary actions and active nav.
- Sidebar: dark slate (`#0f172a`) with slate-300 text.
- App background: very light gray (`#f8fafc`); content on white cards, `1px` slate-200 borders, subtle shadow.
- Radius 10px. Clean sans typography (Inter). No gradients; status colors only for status (green paid/active, amber pending, red cancelled/overdue).
- Implemented as shadcn CSS variables in `index.css`; no hard-coded colors in components.

## 5. Navigation

**Admin (desktop sidebar)**: Dashboard · Sales (Orders, Invoices) · Shops · Products · Expenses · Reports · Order Bookers · Settings (Organization, Areas, Channels, Product Categories, Expense Categories, Users).

Settings sub-sections are tabs under `/settings/*` (`SettingsLayout`); implemented: Organization (`/settings`), Areas (`/settings/areas`).

**Order Booker (mobile bottom nav)**: Home · My Shops · My Orders · Profile.

## 6. Responsive / PWA

- Admin: desktop-first, usable on tablet/phone (tables collapse to cards < `md`).
- Booker: mobile-first, touch targets ≥ 44px, sticky bottom "Submit Order" bar, large −/+ quantity steppers.
- vite-plugin-pwa: installable manifest + app shell caching. The in-progress order is kept in `localStorage` until submitted successfully (protects against weak signal). Full offline queue is a later feature.

## 7. Invoice form (single component)

`features/invoices/components/InvoiceForm.tsx` used by:
- `/invoices/new` (blank)
- `/invoices/new?orderId=…` (prefilled from order)

Selecting a product auto-fills its defaults into the row; every row field is editable; totals recalculate live via the shared calculator; Confirm posts inputs only.

Print view `/invoices/:id/print` replicates the customer's invoice layout with print CSS.
