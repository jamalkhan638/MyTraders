# CLAUDE.md

Before implementing or changing any module, read the relevant files in `/docs` — they are the source of truth:
`product-requirements.md`, `invoice-specification.md`, `architecture.md`, `database-design.md`, `backend-guidelines.md`, `frontend-guidelines.md`, `permissions.md`, `implementation-plan.md`, `operations.md`.

Non-negotiable rules:
- Never accept `organizationId` from the client; use the tenant-scoped Prisma client for tenant data.
- Money is `Decimal` (DB `numeric`, `decimal.js` in code, strings over the API). Never JS floats.
- Backend recomputes all invoice totals, balances and profit; frontend math is UX only.
- Financial multi-write operations run in one transaction. Ledger and confirmed invoices are append-only.
- Invoice formulas marked TBC in `docs/invoice-specification.md` must not be implemented until the owner confirms them — ask.
- If a business rule changes, update `/docs` together with the code, and tick items in `implementation-plan.md`.
- Every module ships tenant-isolation and permission tests.
