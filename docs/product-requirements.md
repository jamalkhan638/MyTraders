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
Company name, address, town/city, phone, NTN, STRN, logo, currency (default `PKR`), timezone (default `Asia/Karachi`), invoice number prefix + padding, order number prefix, default tax rate, shop categories, expense categories.
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

### 4.3a Shop Categories (shop types)
- Admin-only list used to group shops, e.g. Convenience Store, General Store, Supermarket, Wholesale.
- List, search, add, edit, activate/deactivate; never deleted.
- Name required (max 100 chars, extra spaces removed); unique **within the organization** (case/space-insensitive); another organization may use the same name.
- UI: Settings → Shop Categories; table + small dialog (same pattern as Areas).

### 4.4 Shops
Fields: name (required), contact person / owner, phone, address, area (required), assigned Order Booker (optional, one), shop category / shop type (optional, from the configurable Shop Categories list, e.g. *Convenience Store*, *General Store*, *Supermarket*, *Wholesale*; printed as "Channel" on invoices), NTN, STRN, CNIC (all optional), active flag.

- Validation (D-23):
  - Name required (max 150, extra spaces removed); shop names are **not** unique (two shops may share a name).
  - Area required; must be an **active** Area of the same organization.
  - Shop Category optional; must be an **active** category of the same organization.
  - Assigned Order Booker optional; must be an **active `ORDER_BOOKER`** of the same organization (an Admin cannot be assigned).
  - These checks run on create and whenever the value changes; editing other fields of a shop whose area/category/booker was later deactivated is still allowed.
  - A foreign id from another organization is rejected exactly like a non-existent id (422 on that field) — nothing about the other organization is revealed.
  - Phone max 40 (digits, spaces, + - ( )); CNIC max 20 (digits and dashes); NTN/STRN max 40; address max 300.
- Desktop table columns (Phase 2): Shop, Area, Shop Category, Order Booker, Phone, Status, Actions. Outstanding Balance and Last Invoice columns are added with the ledger/invoices (Phases 4–5).
- Filters: search (name, contact person, phone), area, shop category, order booker (incl. "Unassigned"), status. Credit-status filter comes with the ledger.
- **Export the currently filtered list** to Excel and PDF (later in Phase 2).
- Shop details is a dedicated page: info, area, category, order booker, contact/tax info, status. Outstanding balance, invoice history (open any invoice), ledger history, *Add Credit*, *Receive Payment* are placeholders until Phases 4–5.
- **No credit/balance column on Shop** — the balance will always be computed from the ledger.
- Shops that have history are deactivated, never hard-deleted.
- The Order Booker "My Shops" view (Phase 3) lists only shops whose `assignedOrderBookerId` is the signed-in booker; the backend list already supports filtering by order booker and the table is indexed for it.

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
| Name | **Required** (max 150 chars, extra spaces removed) |
| Product Code | Optional; unique per organization when set (case-insensitive) |
| Rate Code | Optional; **display only**, never used in calculations |
| Retail Price (R.P) | **Required**; per unit incl. tax; ≥ 0, max 2 decimals |
| Trade Price (T.P) | **Required**; per unit excl. FED; ≥ 0, max 2 decimals |
| Cost Price | **Required**; per unit; what the distributor is invoiced by the company. Used for profit. |
| Weight | Optional; per unit, > 0, max 3 decimals |
| Unit | Optional; unit of the weight value: KG, Gram, Liter, ML. Shown as "Weight/Unit", e.g. "4.5 KG" |
| Pieces per Carton | Optional; whole number ≥ 1, informational (e.g. 5 for a 1×5 pouch carton) |
| Active | Inactive products cannot be ordered/invoiced |

**No tax rate on products (D-22).** Tax (GST, FED, further tax…) is calculated only when an invoice is generated, with the owner's formulas; the invoice item snapshots the rates and amounts actually used.

Weight totals: `Total Weight = qty × weight`; Tons = kg ÷ 1000 (grams converted to kg). Converting Liter/ML products to tons is **OQ-7**.

When a product is selected on an invoice, its defaults auto-fill the invoice row. Admin can override values **on that invoice only** without changing the product master.

UI: table + right-side drawer for add/edit.

### 4.7 Order Booker experience (mobile)
Navigation: Home · My Shops · My Orders · Profile.

- **My Shops**: only **active** shops assigned to them, grouped by area, with an area filter and search by shop name. Card shows shop name, area, address/contact, *Book Order*. (Outstanding balance is added with the ledger, Phase 5.)
- **Book Order**: shop name, product search over **active** products, add several products, whole-number quantity per product (− / + buttons, ≥ 1), remove a line, optional note, Submit. The draft is kept on the phone until it is submitted.
- **No prices on the booker side (D-24):** the booker never sees cost, trade or retail price, profit, tax, discounts, payments or credit. They enter products and quantities only. (Supersedes D-17; OQ-5 "estimated total" no longer applies.)
- Booker cannot create invoices, manage credit, record payments, or open any Admin screen.
- **My Orders**: only their own orders (number, shop, date, item count, status) and the order details. Booker may cancel their own order while it is still `PENDING`.

### 4.8 Orders
- Statuses: `PENDING` → `INVOICED` or `CANCELLED`. No other workflow states.
- Orders are created **only by Order Bookers** (Admins sell directly with invoices), for an **active shop assigned to them**, with **active products** of the same organization (D-25).
- Lines: product + quantity only, whole units 1–100,000; at most 200 lines; **the same product may not appear twice** — the request is rejected (the UI prevents it) rather than silently merged (D-25).
- Order number: generated by the server inside the create transaction from the organization's order prefix/digits and a per-organization counter (row-locked, so concurrent orders never share a number and a failed order leaves no gap). Client-sent numbers, `organizationId` and `orderBookerId` are ignored.
- Creating the order and all its lines is one transaction.
- Admin sees all organization orders (search by order number or shop; filters: area, order booker, status; newest first). Booker sees only their own; another booker's order behaves as not found.
- Cancel: Admin any `PENDING` order of the organization; booker only their own `PENDING` order.
- Submitted order is immediately visible to Admin (pending list polls every ~20 s). For a `PENDING` order the Admin gets a *Generate Invoice* action, which opens the invoice flow (Phase 4).
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
| D-10 | Shop NTN / STRN / CNIC / contact / shop category (channel) are optional | Owner answer |
| D-11 | No partner split; show Net Profit only | Owner answer |
| D-12 | English UI only | Owner answer |
| D-13 | GST / tax rates are data (never hard-coded); the invoice snapshots the rates actually used | Master spec, amended by D-22 |
| D-14 | Invoice formulas are **not assumed**; they are confirmed by the owner before the invoice module | Owner instruction |
| D-15 | One product = one unit as added by Admin (e.g. one carton); prices, cost and weight are per that unit | Owner answer |
| D-16 | Admin can cancel a confirmed invoice; cancellation automatically reverses the ledger debit | Owner answer |
| D-17 | ~~Order Booker sees both Trade Price and Retail Price~~ — superseded by D-24 | Owner answer |
| D-18 | Admin may set the next invoice number, only forward (never lower than the current counter) | Phase 1 implementation |
| D-19 | In the MVP the Admin manages Order Booker accounts only; Admins are created via CLI | Owner request (Phase 1) |
| D-20 | Logo stored as an image URL; upload deferred | Phase 1 implementation |
| D-22 | Products carry **no tax rate**; tax is calculated at invoice time. Product Name, Retail, Trade and Cost Price are required; Code, Rate Code, Weight, Unit, Pieces per Carton optional | Owner decision (Phase 2) |
| D-23 | Shop foreign keys (area, category, order booker) are validated inside the current organization and must be active when chosen; the booker must have role ORDER_BOOKER; shop names are not unique | Phase 2 implementation |
| D-24 | Order Bookers see **no prices at all** (no cost / trade / retail price, tax, discount, payment, credit) — products and quantities only. Supersedes D-17 | Owner decision (Phase 3) |
| D-25 | Orders are created only by Order Bookers for their own active assigned shops; quantities are whole units (1–100,000); duplicate products in one order are rejected; Admin and booker may cancel a `PENDING` order (booker only their own) | Phase 3 implementation |
| D-21 | **Product Categories removed from the MVP** — products have no category entity. **Shop Categories** (shop types, e.g. Convenience Store, General Store, Supermarket, Wholesale) are kept; they replace the earlier "shop channel" list and are printed as "Channel" on invoices | Owner decision (Phase 2) |

## 6. Open questions

| # | Question | Blocks |
|---|---|---|
| OQ-1 | Exact invoice formulas: R.P, T.P, value excl. tax, GST, FED, TO, ATO, special discount, total trade offer, gross value, further tax, due payment / credit balance, payable value, rounding | Invoice module |
| OQ-2 | Are Sales / Profit based on value **excl. tax** or incl. tax? | Dashboard / Profit |
| OQ-7 | How should Liter / ML products count toward "tons sold" (e.g. a kg-per-liter factor, or shown separately in liters)? | Dashboard weight card |
| OQ-5 | ~~Booker estimated order total~~ — not applicable: bookers see no prices (D-24) | closed |
| OQ-6 | Can Admin invoice loose pieces (invoice has both Qty ctn and Qty pcs columns)? | Invoice module |
