# Architecture

## 1. Overview

```
┌─────────────────────────┐        HTTPS / JSON (REST)        ┌──────────────────────────┐
│ apps/web                │ ───────────────────────────────▶ │ apps/api                 │
│ React + Vite (PWA)      │   Authorization: Bearer <access>  │ NestJS                   │
│ Admin desktop UI        │   refresh cookie (httpOnly)       │ Auth · Tenancy · Modules │
│ Order Booker mobile UI  │ ◀─────────────────────────────── │ Prisma                   │
└─────────────────────────┘                                   └────────────┬─────────────┘
            ▲                                                              │
            │  imports zod schemas, enums, calculators                     ▼
┌─────────────────────────┐                                   ┌──────────────────────────┐
│ packages/shared-types   │ ◀──────── also imported by api ── │ PostgreSQL               │
└─────────────────────────┘                                   └──────────────────────────┘
```

One web app serves both roles; the layout switches by role (Admin sidebar layout vs Order Booker bottom-nav layout).

## 2. Monorepo

pnpm workspaces + Turborepo.

```
apps/
  web/                 React 19 + Vite + TS
  api/                 NestJS + Prisma
packages/
  shared-types/        zod schemas (request/response contracts), enums, pure calculators (Decimal)
  config/              shared tsconfig bases, eslint, prettier
docs/                  this documentation (source of truth)
docker-compose.yml     local PostgreSQL (dev + test databases)
```

- A `packages/ui` package is **not** created yet: shadcn/ui components live in `apps/web/src/components/ui` until a second consumer exists.
- `shared-types` is the single place for API contracts. The backend validates requests with the **same zod schemas** (via `nestjs-zod`), and Swagger is generated from them. This avoids maintaining class-validator DTOs and frontend schemas separately.
- Invoice / profit calculators are pure functions in `shared-types` so the frontend shows the same numbers the backend will compute. The backend always recomputes.

## 3. Technology

| Layer | Choice |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, TanStack Query, TanStack Table, React Hook Form, Zod, Tailwind CSS v4, shadcn/ui, lucide-react, sonner, vite-plugin-pwa |
| Backend | NestJS 11, TypeScript, Prisma 6, nestjs-zod, @nestjs/swagger, nestjs-cls (request context), nestjs-pino (logging), argon2, @nestjs/jwt, @nestjs/throttler, helmet |
| Money | `decimal.js` in code, `numeric` in Postgres |
| Exports | exceljs (Excel), pdfmake (PDF) — generated on the backend |
| Invoice print | Print-optimized invoice page (browser print / save as PDF) |
| DB | PostgreSQL 16 |
| Tests | api: Jest + supertest against a real Postgres test DB (`mytraders_test`; migrations applied with `prisma migrate deploy`, tables truncated per test file); web + shared: Vitest (added when the first frontend logic needs it) |

### Pinned versions
The stack is pinned to the majors documented here (NestJS 11, Prisma 6, TypeScript 5.9, Vite 7, React Router 7, zod 4, Tailwind 4) even where newer majors exist, so upgrades are deliberate, separate changes.

## 4. Authentication

- Email + password. Passwords hashed with **argon2id**.
- **Access token**: JWT, 15 min, sent as `Authorization: Bearer`. Kept **in memory** on the frontend (not localStorage).
- **Refresh token**: random 256-bit opaque value, 30 days, in an `httpOnly; Secure; SameSite=Strict; Path=/api/auth` cookie. Stored **hashed** in `RefreshToken`. Rotated on every refresh; reuse of a rotated token revokes the whole token family (theft detection).
- Access token claims: `sub` (userId), `org` (organizationId or null), `role`.
- On every authenticated request the guard loads the user (`isActive`, role, organization status). Deactivated users or suspended organizations are rejected immediately (cheap indexed lookup; acceptable at MVP scale).
- Login rate-limited (throttler).
- Frontend: on 401 the API client performs a single-flight `POST /auth/refresh` and retries once; on failure → login page. Refresh is also serialized **across browser tabs** with the Web Locks API, because sending an already-rotated refresh token twice is treated as theft.
- On page load the session is restored by calling `POST /auth/refresh` (the access token lives only in memory).
- Refresh cookie: `mt_refresh`, `Path=/api/auth`. Refresh sessions are sliding: each rotation issues a new 30-day token.
- `organizationId`/`role` used for authorization always come from the **database row loaded by the guard**, not from the token claims; a token whose claims no longer match (role changed, user moved) is rejected.
- `User` has DB CHECK constraints: only `SUPER_ADMIN` has `organizationId = NULL`; emails are stored lower-case.

## 5. Multi-tenancy

Model: **shared database, shared schema, `organizationId` column on every tenant-owned table.**

Rules:
1. `organizationId` is **never** accepted from the client. It comes only from the authenticated user.
2. A request-scoped **TenantContext** (nestjs-cls / AsyncLocalStorage) holds `organizationId`, `userId`, `role`, set by the auth guard.
3. A **tenant-scoped Prisma client** (Prisma client extension) is the only client services use for tenant models. It:
   - adds `organizationId = ctx.organizationId` to `where` on `findFirst / findMany / count / aggregate / groupBy / updateMany / deleteMany`;
   - sets `organizationId` on `create / createMany`;
   - **forbids** `findUnique / update / delete / upsert` on tenant models (these cannot be scoped safely) — services use `findFirst` / `updateMany` with the tenant filter, then check the affected count (0 → 404).
4. Cross-entity references are validated inside the tenant: e.g. creating a shop with `areaId` first loads the area through the tenant client; not found → 404/422. This prevents linking to another tenant's IDs.
5. A raw unscoped Prisma client exists only for: auth (login lookup), counters inside transactions, the platform (Super Admin) module — which reads tenant identity, status, Admin accounts and usage counts only (D-38) — and seeds. Its use is limited to those modules and reviewed.
6. **Every module ships tenant-isolation e2e tests** (Org A token cannot read/update Org B record by ID).
   Implementation: `apps/api/src/prisma/tenant-scope.ts` (`TENANT_MODELS` must list every tenant-owned model; models not listed are unreachable through the tenant client — default deny). The Organization row itself is reachable only as `id = current organization`.
7. Future defense-in-depth: PostgreSQL Row-Level Security. Not in MVP.

Responses for another tenant's IDs are **404** (not 403) so existence is not leaked.

## 6. Financial integrity

- Money columns: `numeric(14,2)`. Rates: `numeric(7,4)` (percent). Quantities & weights: `numeric(12,3)`.
- Arithmetic in `decimal.js`; values cross the API as **strings** (e.g. `"2114.06"`), never JS numbers.
- The backend is the authority for invoice totals, ledger balances and profit. Client-sent totals are ignored.
- Critical operations run in a single DB transaction (`prisma.$transaction`, interactive):
  - Confirm invoice (order status, number allocation, invoice, items with snapshots, INVOICE ledger debit).
  - Cancel invoice (status + INVOICE_REVERSAL credit).
  - Record payment (lock shop row `SELECT … FOR UPDATE`, compute balance, reject overpayment, insert entry).
- Ledger is append-only. Corrections are new entries, never edits/deletes.

## 7. Sequential numbering (invoices, orders)

Table `OrganizationCounter(organizationId, key, nextValue)`.
Inside the confirm transaction:
```sql
UPDATE "OrganizationCounter"
   SET "nextValue" = "nextValue" + 1
 WHERE "organizationId" = $1 AND "key" = 'INVOICE'
RETURNING "nextValue" - 1 AS value;
```
The row lock serializes concurrent confirmations per organization; if the transaction rolls back, the increment rolls back too → **no duplicates, no gaps**. `@@unique([organizationId, invoiceNumber])` is the final safety net. Formatted as `prefix + zero-padded value` from organization settings (first customer: `M-` + 8 digits).

## 8. Dates & time

- Timestamps: `timestamptz` (UTC).
- Business dates (invoice date, expense date, ledger entry date): Postgres `date`, chosen in the organization's timezone.
- "This month" ranges are computed in the organization's timezone.

## 9. Error handling & logging

- Global exception filter → consistent body `{ statusCode, error, message, details? }`.
- Prisma `P2002` (unique) → 409, `P2025` (not found) → 404.
- Zod validation errors → 400 with field paths.
- nestjs-pino JSON logs with request id, userId, organizationId. Passwords/tokens are redacted.

## 10. API

REST, JSON, prefix `/api`, Swagger at `/api/docs` (dev only). Pagination: `?page=&pageSize=` → `{ items, total, page, pageSize }`. See [backend-guidelines.md](./backend-guidelines.md) for the endpoint list.

## 11. Deployment

Single Docker image per app (later); managed PostgreSQL with daily backups and point-in-time recovery; web served as static files behind the same domain as the API (`/api`) so the refresh cookie can be `SameSite=Strict`. Configuration, migrations, backup / restore and monitoring: [operations.md](./operations.md).
