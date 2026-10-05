# Implementation Plan

Vertical slices. Each module follows:
schema → migration → service → controller + zod DTO → permission/tenant checks → API tests → frontend API hooks → UI → validation → responsive → tests → end-to-end check → docs updated.

Status legend: ☐ todo · ◐ in progress · ☑ done · ⛔ blocked on open question

## Phase 0 — Foundation docs
- ☑ `/docs` specification files
- ☑ Owner answers: D-15 (per unit), D-16 (cancel + reverse), D-17 (booker sees T.P + R.P)
- ☐ Owner review of docs

## Phase 1 — Platform foundation
- ☑ Monorepo: pnpm workspaces, Turborepo, `packages/config`, `packages/shared-types`
- ☑ `docker-compose.yml` with Postgres (dev + test DBs)
- ☑ `apps/api`: NestJS bootstrap, config (zod env), pino logging, helmet, global exception filter, Swagger
- ☑ Prisma setup, base schema (Organization, User, RefreshToken, OrganizationCounter), first migration
- ☑ Tenant context (nestjs-cls) + tenant-scoped Prisma client extension + isolation test harness
- ☑ Auth: login, refresh rotation, logout, me; JwtAuthGuard, RolesGuard (default deny), throttling
- ☑ CLI `create-organization` (org + first Admin) and dev seed
- ☑ `apps/web`: Vite + React + Tailwind + shadcn setup, theme tokens, router, QueryClient, API client with refresh, login page, AdminLayout, BookerLayout, role-based redirect
- ☑ Organization settings page (`GET/PATCH /organization/settings`; company, logo URL, currency, timezone, tax default, invoice/order numbering)
- ☑ Users / Order Booker management (list with search/filters/pagination, create, edit, password reset, activate/deactivate; Order Bookers page)
- ◐ CI: root scripts `pnpm lint | typecheck | test | test:e2e` done; hosted CI workflow todo

## Phase 2 — Master data
- ☑ Areas (table + dialog) — Settings → Areas; `GET/POST /areas`, `GET/PATCH /areas/:id`
- ☑ Shop Categories (shop types) — Settings → Shop Categories; `GET/POST /shop-categories`, `GET/PATCH /shop-categories/:id`. Product Categories removed from the MVP (D-21)
- ☑ Products (table + drawer) — `GET/POST /products`, `GET/PATCH /products/:id`
- ☑ Product invoice rules (D-26): Type TIN/POUCH, Invoice/Cost Price, Default Tax Rate, Weight Unit + Basis, POUCH requires Pieces per Carton; data-preserving migration; type filter
- ☑ Rate Code removed from products (D-27)
- ☑ Shops (table, filters, drawer, assign booker; FK validation in organization, D-23) — `GET/POST /shops`, `GET/PATCH /shops/:id`
- ☑ Shop details page — info/assignment/tax, outstanding, ledger history, payments, adjustments, invoice history
- ☑ Shops export (filtered): Reports → Shop list — CSV + print (D-36); real `.xlsx` / server PDF later

## Phase 3 — Order Booker flow
- ☑ Booker: My Shops (assigned active shops, area filter, search; no balance — D-24) — `GET /booker/shops|areas`
- ☑ Booker: Book Order (products + whole quantities only, no prices — D-24; draft kept on the phone) — `GET /booker/products`, `POST /orders`
- ☑ Order quantity by product type (D-28): `Qty (Pcs)` for TIN, `Qty (Ctn)` for POUCH; `OrderItem.quantityUnit` stored by the server; totals per unit
- ☑ Booker: My Orders, order details, cancel own pending
- ☑ Admin: Orders list (search/filters/pagination, pending polling), order details, cancel, Generate Invoice entry point (`/invoices/new?orderId=` placeholder until Phase 4)

## Phase 4 — Invoices (formulas confirmed, D-29)
- ☑ Shared invoice calculator (Decimal, ROUND_HALF_UP) + unit tests from the owner's worked examples
- ☑ `GET /invoices/draft`, `POST /invoices/preview`, `POST /invoices` (unified; optional `orderId`), numbering, shop/distributor/product snapshots, order → INVOICED — one transaction; append-only DB triggers
- ☑ Invoice form (direct from shop + prefilled from order), product picker, live preview
- ☑ Invoices list, invoice view / print layout (A4 landscape), shop invoice history, order → invoice link
- ☑ Cancellation — reason, user, time, order stays INVOICED, ledger reversal (Phase 5)
- ☑ Ledger debit on confirm and Due Payment prefill (Phase 5)
- ☑ Payable Value calculated (Grand Total + Advance Tax + Further Tax − ADT discount) and debited to the ledger (D-31)
- ☐ Server-generated PDF file (browser save-as-PDF works now)

## Phase 5 — Ledger & payments (D-30)
- ☑ `ShopLedgerEntry` + `Payment` (append-only triggers, CHECKs, one debit / one reversal per invoice); back-fill of earlier invoices
- ☑ Invoice confirm → INVOICE debit; cancel → INVOICE_REVERSAL credit; Due Payment prefilled from the ledger
- ☑ Record Payment (row lock, overpayment rejected, no future dates); Adjust Credit (increase / decrease with reason)
- ☑ Shop details: current outstanding, ledger history with running balance; shop list Outstanding column (grouped query)
- ☑ Finance → Area Ledger: opening / payments / closing per shop and date, filters, totals, payment entry, print, CSV
- ☑ Total Market Credit service + `GET /ledger/market-credit` (for the Dashboard)
- ☑ Backdated payments / decreases limited by the balance on their date and later balances; cancellation refused if the balance would go negative (D-31)
- ☑ Credit-status filter + Credit Report → Reports → Shop credit (D-36)
- ☐ Real `.xlsx` / server-generated PDF for the area sheet (CSV + browser print are the MVP)
- Payment during invoice creation — not required (payments are recorded from Shop Details and the Area Ledger)

## Phase 6 — Expenses & dashboard
- ☑ Expense categories (Settings), Expenses (table + dialog, filters, period total, edit, void) — D-32
- ☑ Expense totals by date range / current month (`GET /expenses/summary`) for Dashboard and Net Profit
- ☑ Profit service (D-33): `GET /profit/summary?from&to` — Gross Profit = Σ (Payable Value − cost snapshot), Net Profit = Gross − Expenses
- ☐ Future review: tax treatment inside profit
- ☑ `GET /dashboard/summary` + Dashboard page (7 cards, 6-month sales chart, top shops, recent pending orders) — D-34; weight incl. liquids at 1 L = 1 kg (D-35)

## Phase 7 — Reports (D-36)
- ☑ `GET /reports/{sales,invoices,shop-credit,product-sales,expenses,profit,shops}` — composed from Profit / Shop Ledger / Expenses services; one sales definition (`salesWhere`) shared with profit and the dashboard
- ☑ Reports pages (index + 7 tabs): filters in the URL (period, area, shop, product, order booker, status, search), server totals, CSV (Excel) download, print / PDF layout, mobile scrolling tables
- ☑ Tenant-isolation and permission tests (`test/reports.e2e-spec.ts`)
- ☐ Owner review: product-level profit excludes invoice-level Advance Tax / Further Tax / ADT discount (shown as a separate reconciling line)
- ☐ Real `.xlsx` and server-generated PDF exports
- ☐ Searchable shop / product pickers in report filters (the dropdowns list the first 100)

## Phase 8 — PWA & polish
- ☐ PWA manifest/icons, app-shell caching, order draft persistence
- ☐ Mobile review of all Admin pages

## Phase 9 — SaaS platform
- ☐ Super Admin: organizations list, status TRIAL/ACTIVE/SUSPENDED, usage counts
- ☐ Subscription foundation (status only, no billing)

## Later
Stock (transactions, purchases, suppliers, returns, warehouses, damaged), route/visit-day planning, partner share reports, offline order queue, WhatsApp invoice sharing, Postgres RLS.

## First usable milestone (end of Phase 6)
Admin signs in → areas → products → shops → order booker → assigns shops → booker books order on phone → Admin sees pending order → same invoice form prefilled → edits → confirms → invoice on shop, balance updated → direct invoice also works → payment reduces balance → expenses → dashboard shows all cards.
