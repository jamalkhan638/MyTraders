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
| `GET /shops/:id/ledger` | ADMIN | paginated history + balance |
| `POST /shops/:id/payments` | ADMIN | rejects overpayment |
| `POST /shops/:id/adjustments` | ADMIN | Add Credit / reduce, note required |
| `GET /orders?page&pageSize&q&areaId&orderBookerId&status`, `GET /orders/:id` | ADMIN all / BOOKER own | ✅ Phase 3; booker filters are forced to their own orders; another booker's order → 404 |
| `POST /orders` | BOOKER | ✅ `{ shopId, items: [{ productId, quantity }], notes? }`; each line's `quantityUnit` (PIECE for TIN, CARTON for POUCH) is set by the server, a client-sent unit is ignored; summaries return `totalPieces` / `totalCartons` (never mixed); number generated in the transaction; 422 per field for unassigned/inactive shop or inactive/unknown product |
| `POST /orders/:id/cancel` | ADMIN / BOOKER own | ✅ only `PENDING` (409 otherwise) |
| `GET /booker/shops?q&areaId`, `GET /booker/shops/:id`, `GET /booker/areas`, `GET /booker/products?q` | BOOKER | ✅ assigned active shops only; areas of those shops; active products **without any price** (D-24) |
| `POST /invoices/preview` | ADMIN | computes totals server-side without saving |
| `POST /invoices` | ADMIN | body may contain `orderId`; one unified creation path |
| `GET /invoices`, `GET /invoices/:id` | ADMIN | |
| `POST /invoices/:id/cancel` | ADMIN | reason required; reverses ledger debit in the same transaction |
| `GET/POST /expenses`, `PATCH /expenses/:id` | ADMIN | |
| `GET/POST /expense-categories`, `PATCH …/:id` | ADMIN | |
| `GET /dashboard/summary` | ADMIN | one aggregated call |
| `GET /reports/{sales,shop-credit,invoices,product-sales,expenses,profit}` | ADMIN | `?format=json\|xlsx\|pdf` |

Invoice creation is **one endpoint** (`POST /invoices`); when `orderId` is present the order is validated as `PENDING` and flipped to `INVOICED` in the same transaction.

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
- **Invoice**: calculator unit tests from real invoices (once formulas confirmed); cost snapshot preserved after product cost change; totals recomputed server-side ignoring client totals.
- **Order workflow**: booker creates `PENDING`; admin invoices → `INVOICED`; second invoice for same order → 409.
- **Cancellation**: cancel reverses the debit exactly; cancelled invoice excluded from sales/profit/weight; cancelling twice → 409.
- **Ledger**: invoice adds debt; payment reduces; overpayment rejected; balance correct; concurrent payments don't overdraw.
- **Numbering**: concurrent confirmations produce unique, gapless numbers.
- **Profit**: sales, COGS, gross, expenses, net for a period; cancelled invoices excluded.

e2e tests run against a dedicated Postgres test database (docker-compose), reset per test file.
