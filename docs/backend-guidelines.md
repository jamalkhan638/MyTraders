# Backend Guidelines (apps/api)

## 1. Structure

```
apps/api/
  prisma/
    schema.prisma
    migrations/
    seed.ts                 # dev seed
  src/
    main.ts
    app.module.ts
    config/                 # env schema (zod), config module
    prisma/                 # PrismaService, tenant-scoped client extension
    common/
      guards/               # JwtAuthGuard, RolesGuard
      decorators/           # @Roles, @Public, @CurrentUser
      filters/              # global exception filter
      interceptors/
      tenant/               # TenantContext (nestjs-cls)
      money/                # Decimal helpers
    modules/
      auth/
      organizations/        # settings (+ platform later)
      users/
      areas/
      shop-categories/
      products/
      shops/
      orders/
      invoices/
      ledger/               # shop ledger, payments, add credit
      expenses/
      expense-categories/
      dashboard/
      reports/
  test/                     # e2e (supertest) + helpers (org factory, login helper)
  scripts/
    create-organization.ts  # CLI: create org + first admin
```

A startup check (`RouteAccessCheck`) refuses to boot the app if any route lacks `@Public()` or `@Roles(...)`; `@AnyRole()` means any signed-in user.

Each module: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.e2e-spec.ts`, optional `*.service.spec.ts`.

## 2. Rules

1. **Controllers are thin**: parse input (zod DTO), call one service method, return result.
2. **Business logic lives in services.** Pure calculations (invoice, profit) live in `packages/shared-types` and are unit-tested there.
3. **Only use the tenant-scoped Prisma client** for tenant data. Never pass `organizationId` from request input.
4. **Validation**: request schemas are zod schemas from `@mytraders/shared-types`, wrapped with `createZodDto` (nestjs-zod). Global `ZodValidationPipe`.
5. **Money**: never `number`. Prisma `Decimal` ↔ `decimal.js`; serialized as strings.
6. **Transactions** for every multi-write financial operation. Keep transactions short; no external calls inside.
7. **Immutability**: no update/delete endpoints for confirmed invoices or ledger entries.
8. **Errors**: throw Nest HTTP exceptions with clear messages; the global filter formats them. Map known Prisma errors.
9. **Migrations**: every schema change = `prisma migrate dev --name <change>`; migration files are committed. Raw SQL (CHECK constraints) goes into the generated migration file.
10. **Logging**: use the injected pino logger; never log passwords, tokens, or full request bodies of auth routes.
11. Don't modify unrelated modules; don't add abstractions until a second use exists.

## 3. API endpoints (MVP)

Prefix `/api`. All require auth unless marked public.

| Method & path | Role | Notes |
|---|---|---|
| `POST /auth/login` | public | email + password → access token + refresh cookie |
| `POST /auth/refresh` | cookie | rotate refresh token |
| `POST /auth/logout` | any | revoke refresh family |
| `GET /auth/me` | any | current user + organization basics |
| `GET/PATCH /organization/settings` | ADMIN | ✅ Phase 1. `nextInvoiceNumber` may only increase (422 otherwise) |
| `GET /health` | public | liveness + DB check |
| `GET /users?page&pageSize&q&role&status`, `GET /users/:id` | ADMIN | ✅ Phase 1, paginated |
| `POST /users` | ADMIN | ✅ creates an **ORDER_BOOKER** (role/org never from client); 409 if email taken |
| `PATCH /users/:id` | ADMIN | ✅ Order Booker accounts only (403 for Admins): name, email, phone, `isActive`, `password` reset; deactivate/reset revokes sessions |
| `GET /areas?page&pageSize&q&status`, `GET /areas/:id` | ADMIN | ✅ Phase 2, paginated, sorted by name |
| `POST /areas`, `PATCH /areas/:id` | ADMIN | ✅ `name` cleaned (trim, single spaces); duplicate in org → 409; `isActive` to (de)activate; no delete |
| Booker area list for the My Shops filter | BOOKER | Phase 3 (areas of assigned shops only) |
| `GET /shop-categories?page&pageSize&q&status`, `GET /shop-categories/:id` | ADMIN | ✅ Phase 2, same pattern as Areas |
| `POST /shop-categories`, `PATCH /shop-categories/:id` | ADMIN | ✅ duplicate name in org → 409; `isActive` to (de)activate; no delete |
| `GET /products?page&pageSize&q&status&type`, `GET /products/:id` | ADMIN | ✅ Phase 2; `q` matches name or code; `type` = TIN \| POUCH |
| `POST /products`, `PATCH /products/:id` | ADMIN | ✅ prices as decimal strings; duplicate code in org → 409; `isActive` to (de)activate; no delete; cross-field rules (D-26) re-checked on PATCH against the stored product |
| Booker product list (no cost price) | BOOKER | Phase 3, with Book Order |
| `GET /shops?page&pageSize&q&areaId&categoryId&orderBookerId&status`, `GET /shops/:id` | ADMIN | ✅ Phase 2; `orderBookerId=unassigned` for shops without a booker; balance & last invoice added in Phases 4–5 |
| `POST /shops`, `PATCH /shops/:id` | ADMIN | ✅ area/category/booker validated in the organization (422 on the field); `isActive`; no delete |
| Booker "My Shops" (assigned shops only) | BOOKER | Phase 3 — reuses the shops list scoped to `assignedOrderBookerId = current user` |
| `GET /shops/export?format=xlsx\|pdf&<filters>` | ADMIN | exports current filter |
| `GET /shops/:id/ledger?page&pageSize` | ADMIN | ✅ Phase 5; balance + history newest first with server running balance |
| `POST /shops/:id/payments` | ADMIN | ✅ `{ amount, paymentDate, method, reference?, notes? }`; shop row lock; 422 if above the balance on the payment date, if it would make a later balance negative, or future date |
| `POST /shops/:id/adjustments` | ADMIN | ✅ `{ direction: INCREASE\|DECREASE, amount, adjustmentDate, reason }`; decrease follows the same date-aware limit |
| `GET /ledger/areas/:areaId?date&q&outstandingOnly` | ADMIN | ✅ area collection sheet computed from ledger entries (one SQL aggregate) |
| `GET /ledger/market-credit` | ADMIN | ✅ Σ outstanding of all shops (Dashboard later) |
| `GET /orders?page&pageSize&q&areaId&orderBookerId&status`, `GET /orders/:id` | ADMIN all / BOOKER own | ✅ Phase 3; booker filters are forced to their own orders; another booker's order → 404 |
| `POST /orders` | BOOKER | ✅ `{ shopId, items: [{ productId, quantity }], notes? }`; each line's `quantityUnit` (PIECE for TIN, CARTON for POUCH) is set by the server, a client-sent unit is ignored; summaries return `totalPieces` / `totalCartons` (never mixed); number generated in the transaction; 422 per field for unassigned/inactive shop or inactive/unknown product |
| `POST /orders/:id/cancel` | ADMIN / BOOKER own | ✅ only `PENDING` (409 otherwise) |
| `GET /booker/shops?q&areaId`, `GET /booker/shops/:id`, `GET /booker/areas`, `GET /booker/products?q` | BOOKER | ✅ assigned active shops only; areas of those shops; active products **without any price** (D-24) |
| `GET /invoices/draft?shopId=` \| `?orderId=` | ADMIN | ✅ Phase 4; opening state of the form: shop, order lines with current product values, proposed number, today (org tz), Due Payment default (ledger port) |
| `POST /invoices/preview` | ADMIN | ✅ computes every value server-side without saving |
| `POST /invoices` | ADMIN | ✅ inputs only (`shopId`, optional `orderId`, `invoiceDate`, rows, optional invoice-level values); totals/number/status/payableValue sent by the client are ignored (Payable Value is calculated, D-31); 422 per field (`items.N.field`), 409 order not PENDING |
| `GET /invoices?page&pageSize&q&shopId&status`, `GET /invoices/:id` | ADMIN | ✅ from snapshots only |
| `POST /invoices/:id/cancel` | ADMIN | ✅ `{ reason }`; 409 if already cancelled or if the reversal would make the shop's balance negative; linked order stays INVOICED; INVOICE_REVERSAL credit of the original debit in the same transaction |
| `GET /expenses?page&pageSize&from&to&categoryId&q&status`, `GET /expenses/:id` | ADMIN | ✅ Phase 6; list carries `totalAmount` = Σ for the filters |
| `POST /expenses`, `PATCH /expenses/:id`, `POST /expenses/:id/void` | ADMIN | ✅ active category of the org, amount > 0, no future date; edit only while ACTIVE; void with reason (never delete) |
| `GET /expenses/summary?from&to` | ADMIN | ✅ Σ ACTIVE expenses by category; default current month (org tz) — Dashboard / Net Profit |
| `GET /profit/summary?from&to` | ADMIN | ✅ D-33: Σ (Payable Value − totalCost) of CONFIRMED invoices by invoice date (Due Payment never counts); Net = Gross − active expenses; default current month |
| `GET/POST /expense-categories`, `GET/PATCH /expense-categories/:id` | ADMIN | ✅ Phase 6; unique name per org; deactivate, never delete |
| `GET /dashboard/summary` | ADMIN | one aggregated call |
| `GET /reports/{sales,shop-credit,invoices,product-sales,expenses,profit}` | ADMIN | `?format=json\|xlsx\|pdf` |

Invoice creation is **one endpoint** (`POST /invoices`); when `orderId` is present the order is validated as `PENDING` (same shop) and flipped to `INVOICED` in the same transaction. Formulas live only in `packages/shared-types/src/invoices.ts`. Ledger integration goes through `modules/ledger/shop-ledger.service.ts` (`outstandingBalance` for Due Payment, `invoiceConfirmed` / `invoiceCancelled` called inside the invoice transactions). Raw ledger SQL always filters `organizationId` explicitly (raw queries bypass the tenant client). Numbers: `common/numbering/document-number.ts` (shared by orders and invoices).

### Dashboard summary response
```json
{
  "period": { "from": "2026-09-01", "to": "2026-09-30", "timezone": "Asia/Karachi" },
  "currency": "PKR",
  "pendingOrders": 12,
  "marketCredit": "2850000.00",
  "monthlySales": "8450000.00",
  "monthlyWeightKg": "24600.000",
  "monthlyExpenses": "320000.00",
  "monthlyNetProfit": "930000.00",
  "monthlyCashCollected": "6100000.00",
  "latestPendingOrders": [
    { "id": "…", "orderNumber": "ORD-000123", "shopName": "…", "areaName": "…", "bookerName": "…", "itemCount": 3, "createdAt": "…" }
  ]
}
```

## 4. Testing (minimum)

- **Tenant isolation**: product, shop, invoice, order, expense cross-org access → 404.
- **Permissions**: booker → 403 on invoice/expense/ledger/admin endpoints; booker sees only assigned shops; no cost fields.
- **Invoice**: calculator unit tests from the owner's worked examples (D-29); TIN/POUCH quantities; rounding half up; cost snapshot preserved after product cost change; snapshots unchanged after product/shop/org edits; totals recomputed server-side ignoring client totals; Due Payment never touches shop state; concurrent numbering; rollback when confirm fails; DB triggers refuse edits.
- **Order workflow**: booker creates `PENDING`; admin invoices → `INVOICED`; second invoice for same order → 409.
- **Cancellation**: cancel reverses the debit exactly; cancelled invoice excluded from sales/profit/weight; cancelling twice → 409.
- **Ledger**: invoice adds one debit; payment credit reduces; overpayment rejected; concurrent payments can't overdraw (row lock); adjustments; running balance with backdated entries; reversal once on cancel; Due Payment prefill and no ledger change from it; area sheet opening/payments/closing incl. same-day invoices/adjustments, filters, totals; append-only triggers; tenant isolation; permissions.
- **Numbering**: concurrent confirmations produce unique, gapless numbers.
- **Profit**: D-33 rule from the owner's numbers; cancelled invoices and voided expenses excluded; cost snapshot survives product cost changes; negative net; tenant isolation; Admin only.

e2e tests run against a dedicated Postgres test database (docker-compose), reset per test file.
