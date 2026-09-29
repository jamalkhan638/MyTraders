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
| Areas: list (for filter) | ✅ | ✅ only areas of assigned shops |
| Products: manage | ✅ | ❌ |
| Products: list active (name, code, trade price, retail price, weight) | ✅ | ✅ **without cost price** |
| Shops: manage / assign booker | ✅ | ❌ |
| Shops: list / view | ✅ all | ✅ **assigned shops only** (incl. outstanding balance) |
| Orders: create | ✅ | ✅ only for assigned, active shops |
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

- `costPrice`, `unitCost`, `costTotal`, profit figures are **never** serialized to an Order Booker. Booker endpoints use separate response schemas that do not contain these fields.
- Order Booker order creation accepts `shopId` + `[productId, quantity]` only. Any price fields sent are ignored.

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
