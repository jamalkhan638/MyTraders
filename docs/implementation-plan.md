# Implementation Plan

Vertical slices. Each module follows:
schema → migration → service → controller + zod DTO → permission/tenant checks → API tests → frontend API hooks → UI → validation → responsive → tests → end-to-end check → docs updated.

Status legend: ☐ todo · ◐ in progress · ☑ done · ⛔ blocked on open question

## Phase 0 — Foundation docs
- ☑ `/docs` specification files
- ☐ Owner review of docs, open questions answered as needed

## Phase 1 — Platform foundation
- ☐ Monorepo: pnpm workspaces, Turborepo, `packages/config`, `packages/shared-types`
- ☐ `docker-compose.yml` with Postgres (dev + test DBs)
- ☐ `apps/api`: NestJS bootstrap, config (zod env), pino logging, helmet, global exception filter, Swagger
- ☐ Prisma setup, base schema (Organization, User, RefreshToken, OrganizationCounter), first migration
- ☐ Tenant context (nestjs-cls) + tenant-scoped Prisma client extension + isolation test harness
- ☐ Auth: login, refresh rotation, logout, me; JwtAuthGuard, RolesGuard (default deny), throttling
- ☐ CLI `create-organization` (org + first Admin) and dev seed
- ☐ `apps/web`: Vite + React + Tailwind + shadcn setup, theme tokens, router, QueryClient, API client with refresh, login page, AdminLayout, BookerLayout, role-based redirect
- ☐ Organization settings page
- ☐ Users (Admin creates Order Bookers / Admins, deactivate)
- ☐ CI script: lint, typecheck, unit + e2e tests

## Phase 2 — Master data
- ☐ Areas (table + dialog)
- ☐ Shop channels, product categories (settings lists)
- ⛔ Products (table + drawer) — needs **OQ-4** (per piece vs per carton)
- ☐ Shops (table, filters, drawer, assign booker) + ShopLedgerEntry table + balance column
- ☐ Shop details page (info, balance, ledger, Add Credit)
- ☐ Shops export Excel / PDF (filtered)

## Phase 3 — Order Booker flow
- ☐ Booker: My Shops (assigned only, area filter, balance)
- ⛔ Booker: Book Order (cartons, prices, estimated total) — estimated total needs **OQ-5**
- ☐ Booker: My Orders, cancel own pending
- ☐ Admin: Orders list + Pending Orders (polling)

## Phase 4 — Invoices ⛔ needs OQ-1, OQ-3, OQ-6 (owner will provide formulas)
- ☐ Shared invoice calculator + unit tests from real invoices
- ☐ `POST /invoices/preview`, `POST /invoices` (unified; optional `orderId`), numbering, snapshots, ledger debit, order → INVOICED, optional paid amount — one transaction
- ☐ Invoice form (blank + prefilled from order)
- ☐ Invoices list, invoice view, print layout matching reference
- ☐ Cancellation (if OQ-3 = yes)

## Phase 5 — Ledger & payments
- ☐ Receive Payment (overpayment rejected, row lock)
- ☐ Ledger history on shop page, invoice links
- ☐ Credit report

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
