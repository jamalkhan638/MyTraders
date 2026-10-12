# CLAUDE.md

Before implementing or changing any module, read the relevant files in `/docs` — they are the source of truth:
`product-requirements.md`, `invoice-specification.md`, `architecture.md`, `database-design.md`, `backend-guidelines.md`, `frontend-guidelines.md`, `permissions.md`, `implementation-plan.md`, `operations.md`.

Non-negotiable rules:
- Never accept `organizationId` from the client; use the tenant-scoped Prisma client for tenant data.
- Money is `Decimal` (DB `numeric`, `decimal.js` in code, strings over the API). Never JS floats.
- Backend recomputes all invoice totals, balances and profit; frontend math is UX only.
- Financial multi-write operations run in one transaction. The ledger is append-only. Financial records are never hard-deleted.
- **Invoice lifecycle (D-41, D-42)**: CONFIRMED → edited (any number of times) → CANCELLED or VOIDED ("deleted"). Confirmed invoices change only through these Admin workflows; every other change or delete is blocked (DB triggers).
  - **Edit**: reason required; same number, shop, order, creation date; recomputed by the shared calculator; previous version kept in `InvoiceRevision`; ledger gets `INVOICE_EDIT_REVERSAL` (old value) + `INVOICE_EDIT` (new value) dated the edit day — the original debit and its date never change.
  - **Cancel / Delete (void)**: reason required; invoice, lines and snapshots stay; status CANCELLED / VOIDED with who / when / why; one reversal credit (`INVOICE_REVERSAL` / `INVOICE_VOID_REVERSAL`) of the current Payable Value, dated the action day.
  - Edit, cancel and void are refused if the shop balance would go negative; cancelled / voided invoices cannot be edited, cancelled or voided again.
  - Business figures (sales, profit, product sales, dashboard, invoice totals) count CONFIRMED invoices only, with their current values; cancelled / voided stay visible for audit.
- Invoice formulas marked TBC in `docs/invoice-specification.md` must not be implemented until the owner confirms them — ask.
- If a business rule changes, update `/docs` together with the code, and tick items in `implementation-plan.md`.
- Every module ships tenant-isolation and permission tests.
