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
              ├─< ShopLedgerEntry >── Shop, (Invoice), (Payment)
              ├─< Payment >── Shop
              ├─< ExpenseCategory ─< Expense
              └─< OrganizationCounter
User ─< RefreshToken
```

## 3. Ledger convention (D-30)

`ShopLedgerEntry` has two non-negative columns, `debitAmount` and `creditAmount`, exactly one of which is > 0 (DB `CHECK`). **Debit = the shop owes more; credit = the shop owes less.**

| Type | Side | Link | Created by |
|---|---|---|---|
| `INVOICE` | debit | `invoiceId` | invoice confirmation (**Payable Value**, D-31), same transaction |
| `PAYMENT` | credit | `paymentId` (1:1 `Payment`) | Record Payment |
| `MANUAL_ADJUSTMENT` | debit (increase) or credit (decrease) | — (`notes` = reason, required) | Adjust Credit |
| `INVOICE_REVERSAL` | credit | `invoiceId` | invoice cancellation (exact original debit) |

```
Outstanding balance (shop) = Σ debitAmount − Σ creditAmount
Total Market Credit        = Σ debitAmount − Σ creditAmount   over all shops of the organization
Running balance            = SUM(debit − credit) OVER (ORDER BY transactionDate, createdAt, id)
Area sheet (date D)        = opening (< D), day debits / other credits / payments (= D), closing (≤ D)
Cash Collected (period)    = Σ creditAmount of type PAYMENT with transactionDate in period
```
Balances are computed with indexed `SUM` / `GROUP BY` queries (`@@index([organizationId, shopId, transactionDate, createdAt, id])`). There is no balance column; a cache could be added later, the ledger stays the source of truth. `@@unique([invoiceId, type])` → one debit and at most one reversal per invoice; `paymentId @unique`. Append-only triggers on `ShopLedgerEntry` and `Payment`.

## 4. Draft Prisma schema

```prisma
enum OrganizationStatus { TRIAL ACTIVE SUSPENDED }
enum UserRole          { SUPER_ADMIN ADMIN ORDER_BOOKER }
enum OrderStatus       { PENDING INVOICED CANCELLED }
enum InvoiceStatus     { CONFIRMED CANCELLED }
enum LedgerEntryType   { INVOICE PAYMENT MANUAL_ADJUSTMENT INVOICE_REVERSAL }
enum PaymentMethod     { CASH BANK_TRANSFER CHEQUE OTHER }
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
  // NO credit/balance column: balance = Σ ShopLedgerEntry (D-30)
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
  type            ProductType                               // TIN (invoiced by pieces) | POUCH (by cartons) — D-26
  retailPrice     Decimal      @db.Decimal(14, 2)           // R.P, display only
  tradePrice      Decimal      @db.Decimal(14, 2)           // T.P, drives the invoice value
  invoiceCostPrice Decimal     @db.Decimal(14, 2)           // company invoice price; profit only
  defaultTaxRate  Decimal      @db.Decimal(7, 4)            // percent; default only, invoices snapshot; CHECK 0–100
  weight          Decimal?     @db.Decimal(12, 3)           // in `weightUnit`, per `weightBasis`
  weightUnit      ProductUnit?                              // KG | GRAM | LITER | ML; CHECK set when weight set
  weightBasis     WeightBasis?                              // PIECE | CARTON; CHECK set when weight set
  piecesPerCarton Int?                                      // CHECK required when type = POUCH
  isActive        Boolean      @default(true)
  createdAt       DateTime     @default(now()) @db.Timestamptz
  updatedAt       DateTime     @updatedAt @db.Timestamptz
  @@unique([organizationId, codeNormalized])                // Postgres allows many NULLs
  @@index([organizationId, name])
}
// enum ProductUnit { KG GRAM LITER ML }; enum ProductType { TIN POUCH }; enum WeightBasis { PIECE CARTON }
// Prices are per piece for a TIN, per carton for a POUCH (D-26).

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

// enum QuantityUnit { PIECE CARTON } — no prices of any kind on orders (D-24, D-28)
model OrderItem {               // reachable only through its Order (not a tenant model itself)
  id        String @id @default(uuid(7)) @db.Uuid
  orderId   String @db.Uuid     // onDelete: Cascade
  productId String @db.Uuid
  quantity  Int                 // whole number in quantityUnit (D-25, D-28); CHECK quantity > 0
  quantityUnit QuantityUnit     // PIECE (TIN) | CARTON (POUCH); server-set from the product type when booked
  @@unique([orderId, productId])  // a product appears once per order
}

model Invoice {                                   // append-only (DB triggers): only CONFIRMED → CANCELLED
  id                 String        @id @default(uuid(7)) @db.Uuid
  organizationId     String        @db.Uuid
  invoiceNumber      String                        // prefix + padded counter, allocated on confirm
  invoiceDate        DateTime      @db.Date
  shopId             String        @db.Uuid
  orderId            String?       @unique @db.Uuid  // an order is invoiced at most once; null = direct
  status             InvoiceStatus @default(CONFIRMED)   // CONFIRMED | CANCELLED
  // shop snapshot ("Shop information")
  shopName String; shopAddress String?; shopPhone String?; shopContactPerson String?
  shopNtn String?; shopStrn String?; shopCnic String?; shopCategory String? /* "Channel" */; shopArea String
  // distributor snapshot ("Distributor information")
  distributorName String; distributorAddress String?; distributorTown String?; distributorPhone String?
  distributorNtn String?; distributorStrn String?; currency String @db.Char(3)
  // totals computed by the server
  totalValueExclTax  Decimal @db.Decimal(14, 2)
  totalGstAmount     Decimal @db.Decimal(14, 2)
  totalValueInclGst  Decimal @db.Decimal(14, 2)
  totalTradeOffer    Decimal @db.Decimal(14, 2)
  grandTotal         Decimal @db.Decimal(14, 2)  // Σ item grossValue
  totalCost          Decimal @db.Decimal(14, 2)  // Σ item costTotal — profit only
  // optional Admin entries, no formula; null = not printed
  advanceTax Decimal?; furtherTax Decimal?; adtDiscount Decimal?   // numeric(14,2); null = blank, not printed
  payableValue Decimal @db.Decimal(14, 2)       // Grand Total + Advance Tax + Further Tax − ADT discount; ledger debit (D-31)
  duePayment Decimal? @db.Decimal(14, 2)         // previous credit as printed — never read by the ledger
  notes              String?
  createdById        String    @db.Uuid
  cancelledAt        DateTime? @db.Timestamptz
  cancelledById      String?   @db.Uuid
  cancelReason       String?
  createdAt / updatedAt
  @@unique([organizationId, invoiceNumber])
  @@index([organizationId, invoiceDate])
  @@index([organizationId, shopId, invoiceDate])
  @@index([organizationId, status, invoiceDate])
  // CHECK: amounts >= 0; status = CANCELLED ⇔ cancelledAt, cancelledById, cancelReason set
}

model InvoiceItem {                               // tenant model; append-only (DB trigger)
  id               String       @id @default(uuid(7)) @db.Uuid
  organizationId   String       @db.Uuid
  invoiceId        String       @db.Uuid
  lineNo           Int
  productId        String       @db.Uuid
  // product snapshot
  productCode      String?
  productName      String
  productType      ProductType                      // TIN | POUCH
  retailPrice      Decimal      @db.Decimal(14, 2)  // printed only
  tradePrice       Decimal      @db.Decimal(14, 2)  // drives the values
  invoiceCostPrice Decimal      @db.Decimal(14, 2)  // profit only, never printed
  piecesPerCarton  Int?
  weight           Decimal?     @db.Decimal(12, 3)
  weightUnit       ProductUnit?
  weightBasis      WeightBasis?
  // quantities
  qtyCtn           Int?                             // POUCH pricing qty; null for TIN
  qtyPcs           Int?                             // TIN pricing qty; POUCH display only
  totalWeight      Decimal      @db.Decimal(14, 3)
  totalWeightUnit  TotalWeightUnit?                 // KG | LITER
  // values (formulas: invoice-specification.md §3)
  gstRate Decimal @db.Decimal(7, 4); valueExclTax, gstAmount, valueInclGst Decimal(14,2)
  toRate Decimal @db.Decimal(14, 4); toAmount Decimal(14,2); atoRate Decimal(14,4); atoAmount Decimal(14,2)
  specialDiscount, totalTradeOffer, grossValue, costTotal Decimal(14,2)
  @@unique([invoiceId, lineNo])
  @@index([organizationId, productId])
  // CHECK: TIN ⇒ qtyCtn IS NULL AND qtyPcs ≥ 1; POUCH ⇒ qtyCtn ≥ 1; all amounts ≥ 0; 0 ≤ gstRate ≤ 100
}

model Payment {                                   // append-only
  id             String        @id @default(uuid(7)) @db.Uuid
  organizationId String        @db.Uuid
  shopId         String        @db.Uuid
  amount         Decimal       @db.Decimal(14, 2)     // CHECK > 0
  paymentDate    DateTime      @db.Date
  method         PaymentMethod @default(CASH)         // CASH | BANK_TRANSFER | CHEQUE | OTHER
  reference      String?                              // receipt / cheque no.
  notes          String?
  createdById    String        @db.Uuid
  createdAt      DateTime      @default(now()) @db.Timestamptz
  @@index([organizationId, shopId, paymentDate])
  @@index([organizationId, paymentDate])
}

model ShopLedgerEntry {                           // append-only; the source of truth for credit
  id              String          @id @default(uuid(7)) @db.Uuid
  organizationId  String          @db.Uuid
  shopId          String          @db.Uuid
  type            LedgerEntryType // INVOICE | PAYMENT | MANUAL_ADJUSTMENT | INVOICE_REVERSAL
  debitAmount     Decimal         @default(0) @db.Decimal(14, 2)
  creditAmount    Decimal         @default(0) @db.Decimal(14, 2)
  transactionDate DateTime        @db.Date
  invoiceId       String?         @db.Uuid
  paymentId       String?         @unique @db.Uuid
  notes           String?
  createdById     String          @db.Uuid
  createdAt       DateTime        @default(now()) @db.Timestamptz
  @@unique([invoiceId, type])
  @@index([organizationId, shopId, transactionDate, createdAt, id])
  @@index([organizationId, type, transactionDate])
  // CHECK: amounts ≥ 0, exactly one side > 0; INVOICE ⇒ debit + invoiceId; INVOICE_REVERSAL ⇒ credit +
  //        invoiceId; PAYMENT ⇒ credit + paymentId; MANUAL_ADJUSTMENT ⇒ no links, notes required
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

Relation fields (`@relation`) are omitted above for readability; all FKs are real foreign keys with `onDelete: Restrict` (except `RefreshToken → User` and `OrderItem → Order`: `Cascade`; `InvoiceItem → Invoice` is `Restrict` because invoices are never deleted).

## 5. Why these choices

- **Snapshots on Invoice/InvoiceItem**: product/shop/org edits never alter historical invoices or profit (spec §14, §25, §26).
- **`orderId @unique` on Invoice**: DB-level guarantee an order is invoiced once.
- **`payableValue` vs `duePayment`**: the ledger debits only the invoice's own Payable Value; `duePayment` (previous credit) is a printed snapshot the ledger never reads (D-9, D-29). There is no credit column on Shop.
- **Append-only triggers**: `Invoice` rows cannot be deleted and only accept CONFIRMED → CANCELLED (cancel fields); `InvoiceItem` rows cannot be updated or deleted.
- **`organizationId` on InvoiceItem**: product-sales reports aggregate items without joining through invoices, and tenant scoping stays uniform.
- **No `Payment` table**: payments are ledger entries — one source of truth for cash collected and balances.
- **Stock later**: a future `StockTransaction(organizationId, productId, qtyChange, type, refId)` table plugs into the invoice-confirm transaction without changing existing tables.
- **Partners later**: a future `Partner(organizationId, name, sharePercent)` table reads Net Profit; nothing in the core depends on it.
