# Product Requirements

> Source of truth for business rules. If a rule changes, update this file **before or together with** the code.
> Working product name: **MyTraders**. First real customer: a Dalda distributor (Ali Akbar Traders, Abbottabad) — but nothing in the product is Dalda-specific.

## 1. Product goal

A multi-tenant **Distribution Management SaaS** for distributors / wholesalers.
Each organization (distributor) has fully isolated users, order bookers, areas, shops, products, orders, invoices, shop credit, payments, expenses, reports and dashboard data.

- Admins work on desktop (table-heavy web app).
- Order Bookers work on their phone in the market (same web app, simple card-based mobile UI, PWA-installable).
- No native mobile app in the MVP.

## 2. Roles

| Role | Scope | Summary |
|---|---|---|
| `SUPER_ADMIN` | Platform | Manages organizations / subscription status. **Built after the MVP.** |
| `ADMIN` | One organization | Full control of that organization's data. Not unnecessarily restricted. |
| `ORDER_BOOKER` | One organization, own shops only | Views assigned shops, books orders, sees own orders. Nothing else. |

Partners do **not** log in and have no role. See [permissions.md](./permissions.md) for the full matrix.

## 3. Core business structure

```
Area → Shop → Order → Invoice → Shop Ledger (credit / payments)
Products are used by Orders and Invoices.
Expenses are recorded separately by Admin and reduce profit.
```

## 4. Modules and rules

### 4.1 Organization settings
Company name, address, town/city, phone, NTN, STRN, logo, currency (default `PKR`), timezone (default `Asia/Karachi`), invoice number prefix + padding, order number prefix, default tax rate, product categories, shop channels, expense categories.
- Logo is a URL to an image for now (D-20); file upload comes later.
- **Next invoice number** can be set (e.g. to continue the paper invoice book) but only moved **forward**, so a number is never issued twice (D-18).
Currency is an organization setting — it is never hard-coded in the domain model.

### 4.2 Users
- Admin creates users (including Order Bookers) with **name, email, password**, optional phone.
- Login = **email + password**. No 2FA, no public sign-up in the MVP.
- Email is unique **across the whole platform** (so login needs no company code).
- Admin can deactivate a user; a deactivated user loses access immediately.
- MVP user management (D-19): the Admin lists all users of the organization and creates / edits / activates / deactivates **Order Booker** accounts (role is always `ORDER_BOOKER`, organization is always the Admin's). Admin accounts are not editable from the app yet; further Admins are created with the CLI.
- Deactivating a booker or resetting their password signs them out everywhere immediately.
- MVP: organizations and their first Admin are created by a seed/CLI script (Super Admin UI comes later).

### 4.3 Areas
- List, search, add, edit, activate/deactivate.
- Name required (max 100 chars, extra spaces removed); unique **within the organization** (case/space-insensitive); not unique across organizations.
- Areas are never deleted — deactivate instead (history such as shops keeps pointing to them).
- UI: table + small dialog for add/edit.

### 4.4 Shops
Fields: name (required), contact person / owner, phone, address, area (required), assigned Order Booker (optional, one), channel (optional, from configurable list e.g. *Convenience Store*), NTN, STRN, CNIC (all optional), active flag.

- Desktop table columns: Shop, Area, Order Booker, Outstanding Balance, Last Invoice, Status, Actions.
- Filters: search, area, order booker, status, credit status (has balance / zero).
- **Export the currently filtered list** to Excel and PDF.
- Shop details is a dedicated page: info, outstanding balance, invoice history (open any invoice), ledger history, *Add Credit*, *Receive Payment*.
- Shops that have history are deactivated, never hard-deleted.

### 4.5 Shop credit (ledger)
- The outstanding balance is **never a mutable number**. It is always `Σ debit − Σ credit` over the shop's ledger entries.
- **Add Credit** (Admin): records existing credit (e.g. from the old paper khata) or any extra amount owed, with a date and note. Stored as a `MANUAL_ADJUSTMENT` debit.
- **Receive Payment** (Admin): reduces the balance. Stored as a `PAYMENT` credit. **A payment larger than the current outstanding balance is rejected** (owner confirmed overpayment will not happen).
- Confirming an invoice debits the shop with the invoice's own amount (see [invoice-specification.md](./invoice-specification.md)).
- Payments never modify historical invoices.
- **Total Market Credit** = sum of outstanding balances of all shops in the organization.

### 4.6 Products
Product = one sellable unit ("piece"), exactly as the Admin adds it. For the first customer one unit is **one carton** (e.g. "Dalda 5L pouch" = 1 carton containing 5 × 1L pouches; the Admin adds it as one product). **All prices, cost and weight are entered per this one unit** (D-15), and all quantities (orders and invoices) count these units.

Product master (defaults, editable any time):

| Field | Notes |
|---|---|
| Product Code | Optional, unique per organization when set |
| Name | Required |
| Category | Optional, configurable |
| Rate Code | **Display only**, never used in calculations |
| Retail Price (R.P) | Default, per unit incl. tax |
| Trade Price (T.P) | Default, per unit excl. FED |
| Cost Price | Per unit; what the distributor is invoiced by the company. Used for profit. |
| Pieces per Carton | Optional, informational (e.g. 5 for a 1×5 pouch carton); default 1 |
| Weight (kg) | Per unit, entered by Admin; Total Weight = qty × weight; Tons = kg ÷ 1000 |
| Default Tax Rate (%) | Data-driven, never hard-coded 18% |
| Active | Inactive products cannot be ordered/invoiced |

When a product is selected on an invoice, its defaults auto-fill the invoice row. Admin can override values **on that invoice only** without changing the product master.

UI: table + right-side drawer for add/edit.

### 4.7 Order Booker experience (mobile)
Navigation: Home · My Shops · My Orders · Profile.

- **My Shops**: only shops assigned to them, area filter at top, search. Card shows shop name, area, outstanding balance, *Book Order*.
- **Book Order**: product list with search, quantity in units/cartons (− / + buttons), shows **both Trade Price and Retail Price** (D-17), estimated total (see OQ-5), Submit.
- Booker cannot change prices, create invoices, manage credit, record payments, see cost/profit, or open any Admin screen.
- **My Orders**: own orders with status. Booker may cancel their own order while it is still `PENDING`.

### 4.8 Orders
- Statuses: `PENDING` → `INVOICED` or `CANCELLED`. No other workflow states.
- Submitted order is immediately visible to Admin (pending list polls every ~20 s).
- Booker cannot edit an order after submission (Admin edits during invoicing).
- An order can be invoiced **once**. Converting it is atomic with invoice creation.

### 4.9 Invoices
Full detail in [invoice-specification.md](./invoice-specification.md). Key rules:
- **One invoice form**, two entry paths: blank (direct Admin sale) or prefilled from a pending order (shop, products, quantities).
- Admin has full control: change product, quantity, rates, discounts; add/remove rows.
- Backend recalculates every value; frontend totals are UX only.
- Every value needed to reproduce the invoice is **snapshotted**; confirmed invoices never change when products, shops or settings change.
- Admin can cancel a confirmed invoice; the ledger debit is reversed automatically (D-16).
- Invoice numbers are sequential and unique **per organization**, format from settings (first customer: `M-00000001`).
- Printable layout matching the customer's current invoice; print / save-as-PDF.
- Shop's previous outstanding balance is printed on the invoice as **"Credit Balance"** when > 0.

### 4.10 Expenses
- Admin-only. Categories configurable (seeded: Fuel, Salary, Vehicle Maintenance, Loading / Unloading, Rent, Electricity, Miscellaneous).
- Fields: date, category, description, amount.
- Table with period filter and period total; small dialog for add/edit.
- No partner splitting.

### 4.11 Profit
```
Sales         = Σ confirmed invoice sales in period          (base TBC — OQ-2)
COGS          = Σ invoice item cost snapshots in period
Gross Profit  = Sales − COGS
Expenses      = Σ expenses dated in period
Net Profit    = Gross Profit − Expenses
```
- A credit sale is still a sale. Cancelled invoices are excluded.
- Cash Collected, Sales and Market Credit are **separate** numbers and are never mixed.
- Partner split is **not** shown. Only Net Profit.

### 4.12 Dashboard (Admin)
1. Pending Orders (clickable → pending list) + latest pending orders list with "Create Invoice" action
2. Total Market Credit (all-time outstanding)
3. This Month Sales
4. Total Weight Sold This Month (tons; from confirmed invoices only) + sales value
5. This Month Expenses
6. This Month Net Profit
7. Cash Collected This Month

"This month" = calendar month in the organization's timezone.

### 4.13 Reports
Sales, Shop Credit, Invoices, Product Sales, Expenses, Profit, Shop list. Filters: date range, area, shop, product, order booker. Export: Excel + PDF.

### 4.14 Later (not MVP)
Super Admin + subscription status (`TRIAL / ACTIVE / SUSPENDED`), stock / purchases / suppliers / returns / warehouses, route/visit-day planning, partner share reporting, offline order queue, WhatsApp sharing.

## 5. Decision log

| # | Decision | Source |
|---|---|---|
| D-1 | Multi-tenant SaaS, shared DB, `organizationId` on every tenant row | Master spec |
| D-2 | Login by email + password; email globally unique; accounts created by Admin | Owner answer |
| D-3 | Order Booker sees sale prices and shop outstanding balance, never cost/profit | Owner answer |
| D-4 | Order Booker orders in cartons only | Owner answer |
| D-5 | Old khata credit is entered via "Add Credit" (ledger `MANUAL_ADJUSTMENT`) | Owner answer |
| D-6 | Overpayment is rejected by the backend | Owner answer |
| D-7 | Cost price is entered per product by Admin, snapshotted per invoice item | Owner answer |
| D-8 | Rate Code is display-only | Owner answer |
| D-9 | Previous balance printed as "Credit Balance"; ledger debits only this invoice's own amount | Owner answer |
| D-10 | Shop NTN / STRN / CNIC / contact / channel are optional | Owner answer |
| D-11 | No partner split; show Net Profit only | Owner answer |
| D-12 | English UI only | Owner answer |
| D-13 | GST / tax rates are data (product default + per-invoice snapshot) | Master spec |
| D-14 | Invoice formulas are **not assumed**; they are confirmed by the owner before the invoice module | Owner instruction |
| D-15 | One product = one unit as added by Admin (e.g. one carton); prices, cost and weight are per that unit | Owner answer |
| D-16 | Admin can cancel a confirmed invoice; cancellation automatically reverses the ledger debit | Owner answer |
| D-17 | Order Booker sees both Trade Price and Retail Price | Owner answer |
| D-18 | Admin may set the next invoice number, only forward (never lower than the current counter) | Phase 1 implementation |
| D-19 | In the MVP the Admin manages Order Booker accounts only; Admins are created via CLI | Owner request (Phase 1) |
| D-20 | Logo stored as an image URL; upload deferred | Phase 1 implementation |

## 6. Open questions

| # | Question | Blocks |
|---|---|---|
| OQ-1 | Exact invoice formulas: R.P, T.P, value excl. tax, GST, FED, TO, ATO, special discount, total trade offer, gross value, further tax, due payment / credit balance, payable value, rounding | Invoice module |
| OQ-2 | Are Sales / Profit based on value **excl. tax** or incl. tax? | Dashboard / Profit |
| OQ-5 | How is the booker's estimated order total calculated? Default until confirmed: Σ qty × Trade Price, labelled "Estimated" | Orders module (non-blocking) |
| OQ-6 | Can Admin invoice loose pieces (invoice has both Qty ctn and Qty pcs columns)? | Invoice module |
