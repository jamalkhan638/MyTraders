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
- Desktop table columns: Shop, Area, Shop Category, Order Booker, Phone, **Outstanding** (from the ledger, one grouped query per page), Status, Actions. Last Invoice column later.
- Filters: search (name, contact person, phone), area, shop category, order booker (incl. "Unassigned"), status. Credit-status filter → Dashboard / Reports phase.
- **Export the currently filtered list** to Excel and PDF (later in Phase 2).
- Shop details is a dedicated page: info, area, category, order booker, contact/tax info, status. Prominent **Current outstanding** with *Record Payment* and *Adjust Credit*; **Ledger / credit history** (date, type, reference, debit, credit, running balance, notes); **Invoice history** as a separate section; *Generate Invoice*.
- **No credit/balance column on Shop** — the balance is always computed from the ledger (D-30).
- Shops that have history are deactivated, never hard-deleted.
- The Order Booker "My Shops" view (Phase 3) lists only shops whose `assignedOrderBookerId` is the signed-in booker; the backend list already supports filtering by order booker and the table is indexed for it.

### 4.5 Shop credit (ledger) — D-30
The **Shop Ledger is the single source of truth** for shop credit. There is no balance or credit column anywhere; nothing ever overwrites a balance.

```
Outstanding Balance = Σ debit − Σ credit   (over the shop's ledger entries)
```

| Entry | Side | Created by |
|---|---|---|
| `INVOICE` | debit — shop owes more | confirming an invoice: its **Payable Value** (Grand Total + Advance Tax + Further Tax − ADT discount, D-31), dated the invoice date, in the confirm transaction; one per invoice (unique) |
| `PAYMENT` | credit — shop owes less | *Record Payment* (amount, date, method, reference, notes); also stored as a `Payment` |
| `MANUAL_ADJUSTMENT` | debit (*Increase*) or credit (*Decrease*) | *Adjust Credit* with a required reason — e.g. old khata balance (D-5) or a correction |
| `INVOICE_REVERSAL` | credit | cancelling an invoice: exactly the original debit, dated the cancellation day; the debit stays; at most one per invoice |

- **Record Payment** (Admin, Shop Details or Area Ledger): amount > 0, date not in the future (backdating allowed). The amount may not exceed what the shop owed **on the payment date**, and may not make any **later** running balance negative (D-6, D-31) — so a backdated payment can never create a negative balance anywhere in the history. Payments never modify invoices.
- **Adjust Credit** (Admin): Increase or Decrease, amount, date (not in the future, backdating allowed), reason. A decrease follows the same date-aware limit as a payment.
- Payments, decreases and reversals on one shop are serialized with a row lock, so concurrent postings cannot overdraw a shop.
- Ledger entries and payments are **append-only** (database triggers); corrections are new entries.
- **Running balance** = balance after each entry, ordered by (business date, entry time, id) — computed by the server.
- **Due Payment** on the invoice form is prefilled with the current outstanding balance; it is only a printed snapshot — editing it never changes the ledger (D-29).
- **No negative / advance balances in the MVP.** Cancelling an invoice whose reversal would take the shop's current balance below zero is **refused** with a message to correct the related payment or adjustment first (e.g. *Adjust Credit → Increase*), then cancel.
- **Total Market Credit** = Σ outstanding balances of all shops of the organization (`GET /ledger/market-credit`; shown on the Dashboard later).

**Area Ledger (Finance → Area Ledger; also Settings → Areas → "View ledger")** — the digital paper collection sheet, an aggregated view over shop ledger entries (no area balances are stored). For an area and a date, each shop shows:

```
Previous (opening) = Σ(debit − credit) before the date
Invoices / adj.    = debits on the date (+) and non-payment credits on the date (−)
Payment            = Σ PAYMENT credits on the date
Remaining (closing)= Σ(debit − credit) up to and including the date
                   = Previous + invoices/increases − decreases/reversals − Payment
```
Totals of every column come from the server. Filters: area, date (previous day / today / next day), shop search, "only shops with a balance" (opening, closing or payment ≠ 0). Lists the area's active shops plus inactive shops that have ledger entries. A payment entered from the sheet is the normal *Record Payment* (same endpoint, the sheet's date prefilled). Print view (A4 portrait) / browser *Save as PDF* and CSV download for Excel — sufficient for the MVP; real `.xlsx` and server-generated PDF are later enhancements.

### 4.6 Products
Every product has a **Type** that decides how it is invoiced (D-26):

- **TIN** — invoiced by **pieces**: the invoice quantity is `Qty Pcs`; prices are per piece.
- **POUCH** — invoiced by **cartons**: the invoice pricing uses `Qty Ctn`; prices are per carton. `Qty Pcs` is display / reference only and is normally auto-calculated as `Qty Ctn × Pieces per Carton`.

Product master (defaults, editable any time):

| Field | Notes |
|---|---|
| Name | **Required** (max 150 chars, extra spaces removed) |
| Type | **Required**; `TIN` or `POUCH` (see above) |
| Product Code | Optional; unique per organization when set (case-insensitive) |
| Trade Price (T.P) | **Required**; ≥ 0, max 2 decimals. **Drives the invoice value** |
| Invoice / Cost Price | **Required**; ≥ 0, max 2 decimals; what the distributor is invoiced by the company. **Used for profit only** — never in invoice totals |
| Retail Price (R.P) | **Required**; ≥ 0, max 2 decimals. **Display / reference only** — does not affect invoice calculations |
| Default Tax Rate | **Required**; percent 0–100, max 2 decimals (e.g. 18, 17.5). New products are pre-filled with the organization's default tax rate. It is only a default: the invoice item stores the rate actually used. Never hard-coded |
| Weight | Optional; > 0, max 3 decimals |
| Weight Unit | Required when a weight is set: KG, Gram, Liter, ML |
| Weight Basis | Required when a weight is set: `PIECE` (weight of one piece) or `CARTON` (weight of one carton). Shown e.g. "4.5 KG / pc" |
| Pieces per Carton | Whole number ≥ 1. **Required for a POUCH**; optional (reference only) for a TIN |
| Active | Inactive products cannot be ordered/invoiced |

Prices are per piece for a TIN and per carton for a POUCH. The database enforces the cross-field rules too (POUCH ⇒ pieces per carton; weight ⇒ unit and basis; tax rate 0–100).

Weight totals: `Total Weight = qty × weight`; Tons = kg ÷ 1000 (grams converted to kg). Converting Liter/ML products to tons is **OQ-7**.

When a product is selected on an invoice, its defaults auto-fill the invoice row. Admin can override values **on that invoice only** without changing the product master.

UI: table + right-side drawer for add/edit.

### 4.7 Order Booker experience (mobile)
Navigation: Home · My Shops · My Orders · Profile.

- **My Shops**: only **active** shops assigned to them, grouped by area, with an area filter and search by shop name. Card shows shop name, area, address/contact, *Book Order*. (Outstanding balance is added with the ledger, Phase 5.)
- **Book Order**: shop name, product search over **active** products, add several products, whole-number quantity per product (− / + buttons, ≥ 1) labelled by product type — **`Qty (Pcs)` for a TIN, `Qty (Ctn)` for a POUCH** (D-28); the booker never enters pieces for a POUCH, remove a line, optional note, Submit. The draft is kept on the phone until it is submitted.
- **No prices on the booker side (D-24):** the booker never sees cost, trade or retail price, profit, tax, discounts, payments or credit. They enter products and quantities only. (Supersedes D-17; OQ-5 "estimated total" no longer applies.)
- Booker cannot create invoices, manage credit, record payments, or open any Admin screen.
- **My Orders**: only their own orders (number, shop, date, item count, status) and the order details. Booker may cancel their own order while it is still `PENDING`.

### 4.8 Orders
- Statuses: `PENDING` → `INVOICED` or `CANCELLED`. No other workflow states.
- Orders are created **only by Order Bookers** (Admins sell directly with invoices), for an **active shop assigned to them**, with **active products** of the same organization (D-25).
- Lines: product + quantity only, whole numbers 1–100,000. The quantity counts **pieces for a TIN and cartons for a POUCH**; the server stores this unit on the line (`quantityUnit` = `PIECE` | `CARTON`) from the product type at booking time and ignores any unit sent by the client. Pieces of a POUCH are not stored on the order — the invoice derives them (`Qty Pcs = Qty Ctn × Pieces per Carton`). Totals are shown per unit ("13 pcs · 5 ctn"), never added together (D-28); at most 200 lines; **the same product may not appear twice** — the request is rejected (the UI prevents it) rather than silently merged (D-25).
- Order number: generated by the server inside the create transaction from the organization's order prefix/digits and a per-organization counter (row-locked, so concurrent orders never share a number and a failed order leaves no gap). Client-sent numbers, `organizationId` and `orderBookerId` are ignored.
- Creating the order and all its lines is one transaction.
- Admin sees all organization orders (search by order number or shop; filters: area, order booker, status; newest first). Booker sees only their own; another booker's order behaves as not found.
- Cancel: Admin any `PENDING` order of the organization; booker only their own `PENDING` order.
- Submitted order is immediately visible to Admin (pending list polls every ~20 s). For a `PENDING` order the Admin gets a *Generate Invoice* action, which opens the invoice flow (Phase 4).
- Booker cannot edit an order after submission (Admin edits during invoicing).
- An order can be invoiced **once**. Converting it is atomic with invoice creation.

### 4.9 Invoices
Full detail and formulas in [invoice-specification.md](./invoice-specification.md) (confirmed, D-29). Key rules:
- **One invoice form**, two entry points: *Shop details → Generate Invoice* (direct, no rows — no order is created) or *pending order → Generate Invoice* (shop, products and booked quantities prefilled). Admin only.
- Admin has full control before confirming: add / remove / change products, quantities, Trade Price, Retail Price (printed snapshot), GST rate, TO / ATO rate, line Special Discount, invoice-level values.
- **TIN is priced by Qty Pcs** (Qty Ctn not used); **POUCH by Qty Ctn** (Qty Pcs = Qty Ctn × Pieces per Carton, display only, never affects values).
- **Trade Price drives the values; Retail Price is printed only; Invoice / Cost Price is for profit only** and never printed.
- Value Excl Tax = qty × T.P; GST = Value × rate %; TO / ATO = rate × Total Weight; Total Trade Offer = TO + ATO + Special Discount; Gross = Value Incl GST − Total Trade Offer; **Grand Total = Σ Gross** (automatic). Decimal math, ROUND_HALF_UP to 2 decimals.
- Optional invoice-level Advance Tax, Further Tax and ADT / special discount (blank = 0, not printed when zero). **Payable Value = Grand Total + Advance Tax + Further Tax − ADT discount** — calculated, read-only, always printed (D-31).
- **Due Payment** = the shop's previous outstanding credit, prefilled from the ledger, editable on the invoice — **editing it never changes the ledger**.
- Confirming debits the shop ledger with the invoice's **Payable Value** in the same transaction (D-30, D-31); Due Payment never affects it.
- Backend recalculates every value; frontend totals are a live preview only.
- Every value needed to reproduce the invoice is **snapshotted** (shop, distributor, product, prices, quantities, results); confirmed invoices never change when products, shops or settings change (also enforced by database triggers).
- Invoice numbers are sequential and unique **per organization**, assigned on confirm (first customer: `M-00000001`).
- Confirming is one transaction; an order can be invoiced once and becomes `INVOICED`.
- Admin can cancel a confirmed invoice with a reason (D-16); data is kept, a linked order stays `INVOICED`; the ledger gets an `INVOICE_REVERSAL` credit of exactly the original debit (D-30).
- Printable layout (A4 landscape) from the invoice view: browser print / save as PDF.
- Shop details lists the shop's invoice history (number, date, grand total, status → open the invoice).

### 4.10 Expenses — D-32
- **Admin-only** (Order Bookers and Super Admin get 403; the screens are not in their apps). **No partner splitting** — partners do not manage or see expenses in the MVP.
- **Expense Categories** (Settings → Expense Categories), per organization, same pattern as Areas / Shop Categories: list, add, rename, activate / deactivate (never deleted). Name required, unique per organization (case- and space-insensitive), the same name is allowed in another organization. New organizations start with Fuel, Salary, Vehicle Maintenance, Loading / Unloading, Rent, Electricity, Office Expense, Miscellaneous.
- **Expense**: category (an **active** category of the organization), amount (> 0, 2 decimals, numeric), date (backdating allowed, **no future dates**), description and reference / bill no. (optional). Created by / updated by are recorded.
- **Edit** any field while the expense is active; a changed category must be active, keeping a since-deactivated category is allowed.
- **Void** instead of delete: the Admin gives a reason; the expense stays in history (Voided filter) and **no longer counts in any total**. Voided expenses cannot be edited; expenses are never deleted (DB trigger).
- **Expenses page**: table (Date, Category, Description + reference, Amount, Created By, Actions), filters (date range with *This month* / *Last month*, category, search in description / reference, Active / Voided), and **Total expenses** = the server's Σ for the current filters (not just the page). Add / Edit in a small dialog. Mobile: cards.
- **Totals for later**: `GET /expenses/summary?from&to` → Σ active expenses in the period (both dates inclusive) by category; without dates it is the current month in the organization timezone (**This Month Expenses** for the Dashboard). This is the Expenses term of Net Profit.

### 4.11 Profit
```
Sales         = Σ confirmed invoice sales in period          (base TBC — OQ-2)
COGS          = Σ invoice item cost snapshots in period
Gross Profit  = Sales − COGS
Expenses      = Σ ACTIVE expenses dated in period          (GET /expenses/summary, D-32)
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
| D-8 | ~~Rate Code is display-only~~ — Rate Code removed entirely (D-27) | Owner answer |
| D-9 | Previous balance printed on the invoice (now labelled **Due Payment**, D-29); the ledger debits only this invoice's own amount, never the previous balance | Owner answer |
| D-10 | Shop NTN / STRN / CNIC / contact / shop category (channel) are optional | Owner answer |
| D-11 | No partner split; show Net Profit only | Owner answer |
| D-12 | English UI only | Owner answer |
| D-13 | GST / tax rates are data (never hard-coded); the invoice snapshots the rates actually used | Master spec, amended by D-22 and D-26 |
| D-14 | Invoice formulas are **not assumed**; they are confirmed by the owner before the invoice module | Owner instruction |
| D-15 | One product = one unit as added by Admin (e.g. one carton); prices, cost and weight are per that unit — refined by D-26 (TIN per piece, POUCH per carton) | Owner answer |
| D-16 | Admin can cancel a confirmed invoice; cancellation automatically reverses the ledger debit | Owner answer |
| D-17 | ~~Order Booker sees both Trade Price and Retail Price~~ — superseded by D-24 | Owner answer |
| D-18 | Admin may set the next invoice number, only forward (never lower than the current counter) | Phase 1 implementation |
| D-19 | In the MVP the Admin manages Order Booker accounts only; Admins are created via CLI | Owner request (Phase 1) |
| D-20 | Logo stored as an image URL; upload deferred | Phase 1 implementation |
| D-22 | ~~Products carry no tax rate~~ — superseded by D-26. Product Name and the three prices are required; Code, Weight, Pieces per Carton optional | Owner decision (Phase 2) |
| D-26 | Product **Type** `TIN \| POUCH`: a TIN is invoiced by `Qty Pcs`, a POUCH by `Qty Ctn` (`Qty Pcs = Qty Ctn × Pieces per Carton`, display only; POUCH requires Pieces per Carton). **Trade Price drives the invoice value; Invoice/Cost Price is for profit only; Retail Price is display only.** Products carry a required **Default Tax Rate** (pre-filled from the organization default) which the invoice snapshots. Weight has a unit and a basis (`PIECE \| CARTON`). Supersedes D-22, refines D-15 and OQ-6. Cost Price renamed Invoice/Cost Price | Owner decision (before Phase 4) |
| D-27 | **No Rate Code** anywhere — removed from products and not printed on invoices | Owner decision (before Phase 4) |
| D-28 | Order quantity follows the product type: **TIN → pieces, POUCH → cartons**. Each order line stores `quantityUnit` (`PIECE` \| `CARTON`), set by the server from the product type when booked and kept even if the product type changes later. The booker sees `Qty (Pcs)` / `Qty (Ctn)` and enters only that number. Orders stay price-free (no prices, tax, TO/ATO, discounts or totals) | Owner decision (before Phase 4) |
| D-29 | **Invoice formulas** (owner): TIN priced by Qty Pcs, POUCH by Qty Ctn (Qty Pcs display only); Value Excl Tax = qty × Trade Price; GST = Value × rate / 100 (rate snapshotted, default from product); TO / ATO = rate × Total Weight; Total Trade Offer = TO + ATO + line Special Discount; Gross = Value Incl GST − Trade Offer; Grand Total = Σ Gross; Advance Tax / Further Tax / ADT discount optional and hidden when blank (Payable Value: see D-31); Due Payment = previous credit from the ledger, editable snapshot that never changes the ledger; Decimal ROUND_HALF_UP to 2 decimals; Retail Price display only; Invoice/Cost Price profit only | Owner decision (Phase 4) |
| D-30 | **Shop Ledger is the single source of truth** for credit: balance = Σ debit − Σ credit; INVOICE debit (Grand Total, in the confirm transaction, once per invoice), PAYMENT credit (≤ current balance), MANUAL_ADJUSTMENT increase/decrease with reason (decrease not below zero), INVOICE_REVERSAL credit on cancel (exact debit, once); append-only; Area Ledger is a computed collection sheet (opening / payments / closing per shop and date), no stored area balances | Owner decision (Phase 5) |
| D-31 | **Payable Value = Grand Total + Advance Tax + Further Tax − ADT / invoice-level Special Discount** (blank = 0), calculated and stored by the server, always printed; it is the invoice's ledger debit. Due Payment never affects Payable Value or the ledger. Payments / decreases: no future dates, backdating allowed, limited by the balance on their date and never making a later balance negative. Invoice cancellation refused if it would make the current balance negative (no advance balances in the MVP). Area Ledger exports: CSV + browser print / PDF. Later: credit-status filter (Dashboard/Reports), Credit Report (Reports), payment during invoice creation (not required) | Owner decision (Phase 5 review) |
| D-32 | Expenses are Admin-only, per organization, with configurable Expense Categories (unique name per organization, deactivate not delete, defaults seeded); amount > 0, no future dates, active category required; editable while active; **voided with a reason instead of deleted** and then excluded from all totals; no partner splitting; Σ by date range (default current month) is the Expenses term of Net Profit | Owner decision (Phase 6) |
| D-23 | Shop foreign keys (area, category, order booker) are validated inside the current organization and must be active when chosen; the booker must have role ORDER_BOOKER; shop names are not unique | Phase 2 implementation |
| D-24 | Order Bookers see **no prices at all** (no cost / trade / retail price, tax, discount, payment, credit) — products and quantities only. Supersedes D-17 | Owner decision (Phase 3) |
| D-25 | Orders are created only by Order Bookers for their own active assigned shops; quantities are whole units (1–100,000); duplicate products in one order are rejected; Admin and booker may cancel a `PENDING` order (booker only their own) | Phase 3 implementation |
| D-21 | **Product Categories removed from the MVP** — products have no category entity. **Shop Categories** (shop types, e.g. Convenience Store, General Store, Supermarket, Wholesale) are kept; they replace the earlier "shop channel" list and are printed as "Channel" on invoices | Owner decision (Phase 2) |

## 6. Open questions

| # | Question | Blocks |
|---|---|---|
| OQ-1 | ~~Exact invoice formulas~~ — answered by D-29 (see invoice-specification.md; §8 lists implementation choices awaiting review) | closed |
| OQ-2 | Are Sales / Profit based on value **excl. tax** or incl. tax? | Dashboard / Profit |
| OQ-7 | How should Liter / ML products count toward "tons sold" (e.g. a kg-per-liter factor, or shown separately in liters)? | Dashboard weight card |
| OQ-5 | ~~Booker estimated order total~~ — not applicable: bookers see no prices (D-24) | closed |
| OQ-6 | ~~Qty ctn vs Qty pcs~~ — answered by D-26 / D-28 / D-29 (a TIN has no Qty Ctn on the invoice) | closed |
