# Database Design

> PostgreSQL + Prisma. This is the **draft** schema for review. It becomes `apps/api/prisma/schema.prisma` in Phase 1; fields marked `TBC` depend on open questions in [product-requirements.md](./product-requirements.md#6-open-questions).

## 1. Conventions

- IDs: UUID v7 (`@default(uuid(7)) @db.Uuid`) — time-ordered, index-friendly.
- Every tenant-owned table has `organizationId` + an index starting with it.
- Uniqueness is **scoped to the organization** (`@@unique([organizationId, …])`).
- Name uniqueness uses a `nameNormalized` column (trimmed, lower-cased, single spaces), set by the service.
- Money `numeric(14,2)`, rates `numeric(7,4)`, quantity/weight `numeric(12,3)`.
- Business dates are `date`; audit timestamps are `timestamptz`.
- Records referenced by history (products, shops, areas, users) are deactivated (`isActive=false`), not deleted. FKs use `onDelete: Restrict`.
- Ledger and confirmed invoices are append-only / immutable.

## 2. Entity relationships

```
Organization ─┬─< User (ADMIN | ORDER_BOOKER)          SUPER_ADMIN has organizationId = null
              ├─< Area ─────────────< Shop >──── ShopCategory (optional)
              │                        │  └───── User (assignedOrderBooker, optional)
              ├─< Product
              ├─< Order ─< OrderItem >── Product
              │     └── (0..1) Invoice
              ├─< Invoice ─< InvoiceItem >── Product
              ├─< ShopLedgerEntry >── Shop, (Invoice)
              ├─< ExpenseCategory ─< Expense
              └─< OrganizationCounter
User ─< RefreshToken
```

## 3. Ledger convention

`ShopLedgerEntry` has two non-negative columns, exactly one of which is > 0 (DB `CHECK`):

| Type | Column | Effect |
|---|---|---|
| `INVOICE` | debit | shop owes more (invoice's own amount) |
| `PAYMENT` | credit | shop owes less |
| `MANUAL_ADJUSTMENT` | debit or credit | *Add Credit* (debit) — e.g. old khata; reduce (credit) with note |
| `INVOICE_CANCELLATION` | credit | reverses a cancelled invoice's debit (D-16) |

```
Outstanding balance (shop) = Σ debit − Σ credit
Total Market Credit        = Σ debit − Σ credit   over all shops of the organization
Cash Collected (period)    = Σ credit of type PAYMENT with entryDate in period
```
Balances are computed with indexed `SUM` queries. A cached balance column can be added later if needed; the ledger stays the source of truth.

## 4. Draft Prisma schema

```prisma
enum OrganizationStatus { TRIAL ACTIVE SUSPENDED }
enum UserRole          { SUPER_ADMIN ADMIN ORDER_BOOKER }
enum OrderStatus       { PENDING INVOICED CANCELLED }
enum InvoiceStatus     { CONFIRMED CANCELLED }
enum LedgerEntryType   { INVOICE PAYMENT MANUAL_ADJUSTMENT INVOICE_CANCELLATION }
enum CounterKey        { ORDER INVOICE }

model Organization {
  id                  String             @id @default(uuid(7)) @db.Uuid
  name                String
  status              OrganizationStatus @default(TRIAL)
  // settings (1:1, kept on the row for simplicity)
  address             String?
  town                String?
  phone               String?
  ntn                 String?
  strn                String?
  logoUrl             String?
  currency            String             @default("PKR") @db.Char(3)
  timezone            String             @default("Asia/Karachi")
  invoicePrefix       String             @default("INV-")
  invoiceNumberDigits Int                @default(6)
  orderPrefix         String             @default("ORD-")
  orderNumberDigits   Int                @default(6)
  defaultTaxRate      Decimal            @default(0) @db.Decimal(7, 4)
  createdAt           DateTime           @default(now()) @db.Timestamptz
  updatedAt           DateTime           @updatedAt @db.Timestamptz
}

model User {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String?   @db.Uuid              // null only for SUPER_ADMIN
  email          String    @unique               // stored lower-cased; globally unique
  passwordHash   String
  name           String
  phone          String?
  role           UserRole
  isActive       Boolean   @default(true)
  lastLoginAt    DateTime? @db.Timestamptz
  createdAt      DateTime  @default(now()) @db.Timestamptz
  updatedAt      DateTime  @updatedAt @db.Timestamptz
  @@index([organizationId, role])
}

model RefreshToken {
  id           String    @id @default(uuid(7)) @db.Uuid
  userId       String    @db.Uuid
  familyId     String    @db.Uuid
  tokenHash    String    @unique
  expiresAt    DateTime  @db.Timestamptz
  revokedAt    DateTime? @db.Timestamptz
  replacedById String?   @db.Uuid
  createdAt    DateTime  @default(now()) @db.Timestamptz
  @@index([userId])
  @@index([familyId])
}

model Area {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  name           String
  nameNormalized String
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now()) @db.Timestamptz
  updatedAt      DateTime @updatedAt @db.Timestamptz
  @@unique([organizationId, nameNormalized])
}

model ShopCategory {           // shop type, e.g. Convenience Store, Wholesale (D-21)
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  name           String
  nameNormalized String
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now()) @db.Timestamptz
  updatedAt      DateTime @updatedAt @db.Timestamptz
  @@unique([organizationId, nameNormalized])
}

model Shop {
  id                    String   @id @default(uuid(7)) @db.Uuid
  organizationId        String   @db.Uuid
  name                  String                                 // required, not unique
  contactPerson         String?                                // owner / contact person
  phone                 String?
  address               String?
  ntn                   String?
  strn                  String?
  cnic                  String?
  areaId                String   @db.Uuid                      // Area (same organization, validated)
  categoryId            String?  @db.Uuid                      // ShopCategory (same organization, validated)
  assignedOrderBookerId String?  @db.Uuid                      // User with role ORDER_BOOKER (same organization)
  isActive              Boolean  @default(true)
  createdAt             DateTime @default(now()) @db.Timestamptz
  updatedAt             DateTime @updatedAt @db.Timestamptz
  // NO credit/balance column: balance = Σ ShopLedgerEntry (Phase 5)
  @@index([organizationId, name])
  @@index([organizationId, areaId])
  @@index([organizationId, categoryId])
  @@index([organizationId, assignedOrderBookerId])            // booker "My Shops" (Phase 3)
}

model Product {
  id              String       @id @default(uuid(7)) @db.Uuid
  organizationId  String       @db.Uuid
  name            String                                    // required
  code            String?                                   // optional
  codeNormalized  String?                                   // lower-cased code; unique per org when set
  rateCode        String?                                   // display only
  retailPrice     Decimal      @db.Decimal(14, 2)           // R.P per unit (D-15), required
  tradePrice      Decimal      @db.Decimal(14, 2)           // T.P per unit, required
  costPrice       Decimal      @db.Decimal(14, 2)           // company invoice price per unit, required
  weight          Decimal?     @db.Decimal(12, 3)           // per unit, in `unit`
  unit            ProductUnit?                              // KG | GRAM | LITER | ML
  piecesPerCarton Int?                                      // informational
  isActive        Boolean      @default(true)
  createdAt       DateTime     @default(now()) @db.Timestamptz
  updatedAt       DateTime     @updatedAt @db.Timestamptz
  @@unique([organizationId, codeNormalized])                // Postgres allows many NULLs
  @@index([organizationId, name])
}
// enum ProductUnit { KG GRAM LITER ML }   — no tax rate on products (D-22)

model Order {
  id             String      @id @default(uuid(7)) @db.Uuid
  organizationId String      @db.Uuid
  orderNumber    String                                 // prefix + zero-padded counter, server-generated
  shopId         String      @db.Uuid
  orderBookerId  String      @db.Uuid                   // always the signed-in booker
  status         OrderStatus @default(PENDING)
  notes          String?
  cancelledAt    DateTime?   @db.Timestamptz
  cancelledById  String?     @db.Uuid
  createdAt      DateTime    @default(now()) @db.Timestamptz
  updatedAt      DateTime    @updatedAt @db.Timestamptz
  @@unique([organizationId, orderNumber])
  @@index([organizationId, status, createdAt])
  @@index([organizationId, orderBookerId, createdAt])
  @@index([organizationId, shopId])
}

model OrderItem {               // reachable only through its Order (not a tenant model itself)
  id        String @id @default(uuid(7)) @db.Uuid
  orderId   String @db.Uuid     // onDelete: Cascade
  productId String @db.Uuid
  quantity  Int                 // whole units, e.g. cartons (D-15, D-25); CHECK quantity > 0
  @@unique([orderId, productId])  // a product appears once per order
}

model Invoice {
  id                   String        @id @default(uuid(7)) @db.Uuid
  organizationId       String        @db.Uuid
  invoiceNumber        String
  invoiceDate          DateTime      @db.Date
  shopId               String        @db.Uuid
  orderId              String?       @unique @db.Uuid  // an order is invoiced at most once
  status               InvoiceStatus @default(CONFIRMED)
  shopSnapshot         Json          // name, address, ntn, strn, cnic, contactPerson, category (printed as "Channel")
  organizationSnapshot Json          // name, address, ntn, strn, phone, town, currency
  // totals (formulas: invoice-specification.md — TBC)
  totalWeightKg        Decimal       @db.Decimal(12, 3)
  valueExclTax         Decimal       @db.Decimal(14, 2)
  taxAmount            Decimal       @db.Decimal(14, 2)
  tradeOfferTotal      Decimal       @db.Decimal(14, 2)
  specialDiscountTotal Decimal       @db.Decimal(14, 2)
  grandTotal           Decimal       @db.Decimal(14, 2)
  furtherTax           Decimal       @default(0) @db.Decimal(14, 2)
  invoiceAmount        Decimal       @db.Decimal(14, 2) // amount debited to the shop ledger
  previousBalance      Decimal       @db.Decimal(14, 2) // printed as "Credit Balance"
  payableValue         Decimal       @db.Decimal(14, 2)
  paidAmount           Decimal       @default(0) @db.Decimal(14, 2)
  costTotal            Decimal       @db.Decimal(14, 2)
  notes                String?
  createdById          String        @db.Uuid
  cancelledAt          DateTime?     @db.Timestamptz
  cancelledById        String?       @db.Uuid
  cancelReason         String?
  createdAt            DateTime      @default(now()) @db.Timestamptz
  updatedAt            DateTime      @updatedAt @db.Timestamptz
  @@unique([organizationId, invoiceNumber])
  @@index([organizationId, invoiceDate])
  @@index([organizationId, shopId, invoiceDate])
}

model InvoiceItem {
  id              String  @id @default(uuid(7)) @db.Uuid
  organizationId  String  @db.Uuid                    // denormalized for tenant-scoped reporting
  invoiceId       String  @db.Uuid
  lineNo          Int
  productId       String  @db.Uuid
  // snapshots
  productCode     String?
  productName     String
  rateCode        String?
  retailPrice     Decimal @db.Decimal(14, 2)
  tradePrice      Decimal @db.Decimal(14, 2)
  piecesPerCarton Int
  unitWeightKg    Decimal @db.Decimal(12, 3)
  unitCost        Decimal @db.Decimal(14, 2)
  // quantities
  cartonQty       Decimal @db.Decimal(12, 3)
  pieceQty        Decimal @db.Decimal(12, 3)
  totalWeightKg   Decimal @db.Decimal(12, 3)
  // tax / offers / values (formulas TBC)
  valueExclTax    Decimal @db.Decimal(14, 2)
  taxRate         Decimal @db.Decimal(7, 4)
  taxAmount       Decimal @db.Decimal(14, 2)
  toRate          Decimal @default(0) @db.Decimal(14, 4)
  atoRate         Decimal @default(0) @db.Decimal(14, 4)
  specialDiscount Decimal @default(0) @db.Decimal(14, 2)
  tradeOffer      Decimal @default(0) @db.Decimal(14, 2)
  grossValue      Decimal @db.Decimal(14, 2)
  costTotal       Decimal @db.Decimal(14, 2)
  @@unique([invoiceId, lineNo])
  @@index([organizationId, productId])
}

model ShopLedgerEntry {
  id             String          @id @default(uuid(7)) @db.Uuid
  organizationId String          @db.Uuid
  shopId         String          @db.Uuid
  type           LedgerEntryType
  debit          Decimal         @default(0) @db.Decimal(14, 2)
  credit         Decimal         @default(0) @db.Decimal(14, 2)
  entryDate      DateTime        @db.Date
  invoiceId      String?         @db.Uuid
  notes          String?
  createdById    String          @db.Uuid
  createdAt      DateTime        @default(now()) @db.Timestamptz
  @@index([organizationId, shopId, entryDate])
  @@index([organizationId, type, entryDate])
  // raw SQL migration: CHECK (debit >= 0 AND credit >= 0 AND (debit = 0) <> (credit = 0))
}

model ExpenseCategory {
  id             String  @id @default(uuid(7)) @db.Uuid
  organizationId String  @db.Uuid
  name           String
  nameNormalized String
  isActive       Boolean @default(true)
  @@unique([organizationId, nameNormalized])
}

model Expense {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  categoryId     String   @db.Uuid
  amount         Decimal  @db.Decimal(14, 2)
  expenseDate    DateTime @db.Date
  description    String?
  createdById    String   @db.Uuid
  createdAt      DateTime @default(now()) @db.Timestamptz
  updatedAt      DateTime @updatedAt @db.Timestamptz
  @@index([organizationId, expenseDate])
  @@index([organizationId, categoryId, expenseDate])
}

model OrganizationCounter {
  organizationId String     @db.Uuid
  key            CounterKey
  nextValue      Int        @default(1)
  @@id([organizationId, key])
}
```

Relation fields (`@relation`) are omitted above for readability; all FKs are real foreign keys with `onDelete: Restrict` (except `RefreshToken → User` and `OrderItem → Order`, `InvoiceItem → Invoice`: `Cascade`).

## 5. Why these choices

- **Snapshots on Invoice/InvoiceItem**: product/shop/org edits never alter historical invoices or profit (spec §14, §25, §26).
- **`orderId @unique` on Invoice**: DB-level guarantee an order is invoiced once.
- **`invoiceAmount` vs `previousBalance`**: ledger debits only the invoice's own amount; the previous balance is display-only (D-9).
- **`organizationId` on InvoiceItem**: product-sales reports aggregate items without joining through invoices, and tenant scoping stays uniform.
- **No `Payment` table**: payments are ledger entries — one source of truth for cash collected and balances.
- **Stock later**: a future `StockTransaction(organizationId, productId, qtyChange, type, refId)` table plugs into the invoice-confirm transaction without changing existing tables.
- **Partners later**: a future `Partner(organizationId, name, sharePercent)` table reads Net Profit; nothing in the core depends on it.
