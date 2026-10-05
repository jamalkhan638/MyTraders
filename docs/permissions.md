# Permissions

**The backend is the security authority.** Hidden buttons / routes on the frontend are UX only.
Every request is checked for: authenticated → user active → organization not suspended → role allowed → record belongs to the user's organization (and, for Order Bookers, to their assigned shops / own orders).

## 1. Matrix

| Capability | ADMIN | ORDER_BOOKER |
|---|:---:|:---:|
| Organization settings | ✅ | ❌ |
| Users: create / edit / deactivate | ✅ | ❌ |
| Own profile / change own password | ✅ | ✅ |
| Areas: manage | ✅ | ❌ |
| Shop Categories: manage | ✅ | ❌ |
| Areas: list (for filter) | ✅ | ✅ only areas of their assigned active shops (`GET /booker/areas`) |
| Products: manage | ✅ | ❌ |
| Products: list active (name, code, type, weight/unit/basis, pieces per carton) | ✅ | ✅ **no prices at all** — D-24 (`GET /booker/products`) |
| Shops: manage / assign booker | ✅ | ❌ |
| Shops: list / view | ✅ all | ✅ **assigned active shops only** (`GET /booker/shops`); balance added in Phase 5 |
| Orders: create | ❌ (Admins invoice directly) | ✅ only for their assigned, active shops, active products |
| Orders: list / view | ✅ all | ✅ own orders only |
| Orders: cancel | ✅ any pending | ✅ own pending only |
| Invoices: create / confirm (direct or from order) | ✅ | ❌ |
| Invoices: list / view / print | ✅ | ❌ |
| Invoices: cancel (auto-reverses ledger) | ✅ | ❌ |
| Ledger: add credit / receive payment | ✅ | ❌ |
| Ledger: view history | ✅ | ❌ |
| Expenses & categories | ✅ | ❌ |
| Dashboard / profit / reports / exports | ✅ | ❌ |

`SUPER_ADMIN` (later): platform module only (organizations, status, usage). Has no organization and cannot use tenant endpoints.

## 2. Field-level rules

- **No price of any kind** (cost, trade, retail), tax, discount, payment, credit or profit is ever serialized to an Order Booker (D-24). Booker endpoints (`/booker/*`, `/orders`) use response schemas that do not contain these fields; tests assert it.
- Order Booker order creation accepts `shopId` + `[productId, quantity]` + optional `notes` only. Any other field sent (price, discount, status, order number, `organizationId`, `orderBookerId`) is dropped by validation.
- The order's organization and booker always come from the session; a booker's order list/detail is always limited to `orderBookerId = current user` (another booker's order id → 404).

## 3. Implementation

- `@Roles(UserRole.ADMIN)` decorator + `RolesGuard` on every controller/handler. **Default deny**: a handler without `@Roles` or `@Public` fails a startup check / test.
- Tenant scope via the tenant Prisma client (see [architecture.md](./architecture.md#5-multi-tenancy)).
- Booker scope in services: shop queries add `assignedOrderBookerId = ctx.userId`; order queries add `orderBookerId = ctx.userId`.
- Foreign IDs outside scope → **404**.

## 4. Required tests (per module)

- Org A Admin cannot read / update / delete Org B's record by ID (404).
- Order Booker gets 403 on every Admin-only endpoint.
- Order Booker cannot see or order for a shop not assigned to them.
- Order Booker product list does not contain cost fields.
