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
- ☐ Shops export Excel / PDF (filtered)

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
- ☐ Optional paid-amount-at-invoice-time — Phase 5 (payments)
- ☐ Server-generated PDF file (browser save-as-PDF works now)

## Phase 5 — Ledger & payments (D-30)
- ☑ `ShopLedgerEntry` + `Payment` (append-only triggers, CHECKs, one debit / one reversal per invoice); back-fill of earlier invoices
- ☑ Invoice confirm → INVOICE debit; cancel → INVOICE_REVERSAL credit; Due Payment prefilled from the ledger
- ☑ Record Payment (row lock, overpayment rejected, no future dates); Adjust Credit (increase / decrease with reason)
- ☑ Shop details: current outstanding, ledger history with running balance; shop list Outstanding column (grouped query)
- ☑ Finance → Area Ledger: opening / payments / closing per shop and date, filters, totals, payment entry, print, CSV
- ☑ Total Market Credit service + `GET /ledger/market-credit` (for the Dashboard)
- ☐ Shop list credit-status filter; Credit report (Phase 7)
- ☐ Server-generated XLSX / PDF for the area sheet (browser print + CSV today)
- ☐ Optional paid-amount-at-invoice-time

## Phase 6 — Expenses & dashboard
- ☐ Expense categories, Expenses (table + dialog, period total)
- ⛔ Profit service (needs **OQ-2**: sales base excl./incl. tax)
- ☐ `GET /dashboard/summary` + Dashboard page (cards + latest pending orders)

## Phase 7 — Reports
- ☐ Sales, Shop Credit, Invoices, Product Sales, Expenses, Profit — filters + Excel/PDF

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
