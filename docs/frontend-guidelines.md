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

**Admin (desktop sidebar)**: Dashboard · Sales (Orders, Invoices) · Shops · Products · Expenses · Reports · Order Bookers · Settings (Organization, Areas, Shop Categories, Expense Categories). Order Bookers have their own sidebar entry.

Settings sub-sections are tabs under `/settings/*` (`SettingsLayout`); implemented: Organization (`/settings`), Areas (`/settings/areas`), Shop Categories (`/settings/shop-categories`).

**Order Booker (mobile bottom nav)**: Home · My Shops · My Orders · Profile.

## 6. Responsive / PWA

- Admin: desktop-first, usable on tablet/phone (tables collapse to cards < `md`).
- Booker: mobile-first, touch targets ≥ 44px, sticky bottom "Submit Order" bar, large −/+ quantity steppers.
- vite-plugin-pwa: installable manifest + app shell caching. The in-progress order is kept in `localStorage` until submitted successfully (protects against weak signal). Full offline queue is a later feature.

## 7. Invoice form (single component)

`features/invoices/components/InvoiceForm.tsx`, opened by `pages/InvoiceFormPage.tsx` from:
- `/shops/:shopId/invoices/new` — direct invoice for the shop (no rows)
- `/invoices/new?orderId=…` — prefilled from a pending order

Both load `GET /invoices/draft`. Full page (not a dialog): header card (shop, proposed number, invoice date, Due Payment), a wide row grid (horizontal scroll, sticky Product column, compact right-aligned inputs; calculated cells read-only), a summary card (Grand Total read-only, optional Advance Tax / Further Tax / ADT discount inputs, Due Payment shown as display-only, and the read-only **Payable Value** = Grand Total + Advance Tax + Further Tax − ADT discount) and *Confirm invoice* behind a confirmation dialog. Products are added / swapped with `ProductPickerDialog` (active products); a new row takes the product's T.P, R.P and default tax rate. TIN rows have no Qty (Ctn) input; POUCH Qty (Pcs) follows Qty (Ctn) × pieces per carton until edited ("reset" link). Live values come from the shared calculator; the server recomputes on confirm and field errors (`items.N.field`) are shown on the cells.

Invoice view `/invoices/:id` is also the print layout (print CSS: A4 landscape, app chrome hidden via `print:hidden`, cost never shown, blank optional rows omitted). Invoices list `/invoices`; shop details shows the shop's invoice history.

Wide tables inside `overflow-x-auto` must also be `relative`, otherwise absolutely positioned children (e.g. `sr-only` labels) widen the whole page.

## 8. Shop credit and Area Ledger

- **Shop details**: a prominent *Current outstanding* card (from `GET /shops/:id`, which carries the ledger balance) with *Record payment* and *Adjust credit* dialogs (`features/ledger/components`), then the *Ledger / credit history* table (server running balance) and the separate *Invoice history*.
- **Finance → Area Ledger** (`/finance/area-ledger?areaId&date`): area select, date with previous / next / today, shop search, "only shops with a balance"; Previous / Invoices-adj. / Payment / Remaining / Last payment per shop; totals row from the server; per-row *Payment* opens the same `RecordPaymentDialog` with the sheet's date. Print (A4 portrait) and CSV download (opens in Excel; built from the server's decimal strings).
- Every ledger posting (payment, adjustment, invoice confirm / cancel) invalidates ledger, shop and invoice-draft queries (`invalidateBalances`), so Shop Details, the shop list, the area sheet and Due Payment always show the server's numbers.

## 9. Expenses

- **Expenses** page (`/expenses`, Admin): filters (date range + This month / Last month, category, Active / Voided, search), a **Total expenses** card showing the server's `totalAmount` for the filters, table / mobile cards, *Add expense* and *Edit* in `ExpenseFormDialog`, *Void* in `VoidExpenseDialog` (reason required).
- **Settings → Expense Categories**: same table + dialog + activate / deactivate pattern as Shop Categories.

## 10. Dashboard

`/dashboard` (Admin): stat cards (white cards, muted label + icon, large tabular value, one-line note; clickable cards link to Orders?status=PENDING, Area Ledger (Market Credit), Invoices, Expenses; weight in tons with liquids at 1 L = 1 kg), a single-series column chart (`SalesChart`: primary green — validated against the card surface — 24px columns with a 4px rounded cap, hairline grid, current month labelled, hover / focus tooltip, sr-only table, drawn at the container's measured width so text stays legible on phones), Top shops, Recent pending orders (table on desktop, cards on phones). `/orders?status=PENDING` preselects the status filter.
