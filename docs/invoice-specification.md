# Invoice Specification

> **Status: confirmed by the owner (D-29, before Phase 4).** The formulas below are implemented once, in
> `packages/shared-types/src/invoices.ts` (`calculateInvoiceLine`, `calculateInvoiceTotals`). The api uses
> them as the authority when an invoice is confirmed; the web uses the same code for the live preview.
> Tests: `apps/api/src/modules/invoices/invoice-calculator.spec.ts` (owner's worked examples) and
> `apps/api/test/invoices.e2e-spec.ts`. Items marked **(to confirm)** in §8 are implementation choices
> awaiting the owner's review.

The invoice is a real FMCG distributor sale invoice (tax, trade offers, carton/piece quantities, weight).
Reference: the customer's current invoice (Ali Akbar Traders, `M-00000001`).

## 1. Principles

1. **One invoice form**, two entry points — no separate implementation for orders:
   - **Direct** — *Shops → shop → Generate Invoice* (`/shops/:shopId/invoices/new`): the shop, no rows.
   - **From order** — *Orders → pending order → Generate Invoice* (`/invoices/new?orderId=…`): shop, products and booked quantities prefilled.
   Both open with `GET /invoices/draft` and confirm with the same `POST /invoices`.
2. The Admin has full control before confirming: add / remove / change products, quantities, Trade Price, Retail Price (printed snapshot), GST rate, TO / ATO rate, line Special Discount, invoice-level values, invoice date, Due Payment.
3. **The product holds defaults; the invoice item holds what was used.** Editing a value on an invoice never changes the product master.
4. **Backend recomputes everything** from the inputs and ignores any total / number / status / organization sent by a client.
5. **Confirm = one transaction**: (if from order) order `PENDING → INVOICED` → invoice number → products validated and priced → invoice + items with all snapshots → **`INVOICE` ledger debit of the Payable Value** (D-30, D-31). Any failure rolls all of it back: the order stays `PENDING`, the number is not used, no debit exists.
6. A confirmed invoice is **immutable** (database triggers too). Admin can **cancel** it (D-16): it becomes `CANCELLED` with reason, user and time; all data stays; a linked order stays `INVOICED`; in the same transaction the ledger gets an `INVOICE_REVERSAL` credit of exactly the original debit (once — unique per invoice).

## 2. Prices and product type (D-26, D-29)

| Price | Role on the invoice |
|---|---|
| **Trade Price (T.P)** | Distributor's selling price to the shop, excl. tax. **Drives all invoice values.** Editable per invoice row. |
| **Retail Price (R.P)** | End-customer reference price. **Printed only, never calculated with.** Editable per invoice row (snapshot). |
| **Invoice / Cost Price** | What the distributor pays the company. **Profit only**: snapshotted on the item, never printed, never in the shop's totals. |

| Type | Pricing quantity | Qty (Ctn) | Qty (Pcs) |
|---|---|---|---|
| **TIN** | **Qty Pcs** | not used — hidden on the form, stored `null` | editable, required ≥ 1 |
| **POUCH** | **Qty Ctn** | editable, required ≥ 1 | display / reference only; starts as `Qty Ctn × Pieces per Carton`, follows Qty Ctn until the Admin types their own value; **never affects any value** |

Behaviour comes from `Product.type`, never from the product name.

## 3. Row formulas (per invoice item)

```
pricing qty       = Qty Pcs (TIN) | Qty Ctn (POUCH)
Value Excl Tax    = pricing qty × Trade Price
GST Amount        = round2(Value Excl Tax × GST Rate / 100)
Value Incl GST    = Value Excl Tax + GST Amount
TO Amount         = round2(TO Rate × Total Weight)          TO Rate is an amount per unit of weight, not a %
ATO Amount        = round2(ATO Rate × Total Weight)
Total Trade Offer = TO Amount + ATO Amount + Special Discount    (Special Discount: amount, default 0)
Gross Value       = Value Incl GST − Total Trade Offer
Cost (profit)     = round2(pricing qty × Invoice/Cost Price)     never in the shop's totals
```

Worked example (owner): POUCH, T.P 2,102 / carton, Qty Ctn 2, 5 pcs/ctn, 4.5 kg per carton, GST 18 %, TO 5, ATO 3, Special Discount 10 →
Qty Pcs 10 · Value Excl Tax 4,204.00 (not 10 × 2,102) · GST 756.72 · Value Incl GST 4,960.72 · Total Weight 9 · TO 45 · ATO 27 · Total Trade Offer 82 · Gross 4,878.72.

**Total Weight** (from the product's stored weight, unit and basis; rounded to 3 decimals):

| Type | Weight basis | Total Weight |
|---|---|---|
| TIN | per piece | weight × Qty Pcs |
| TIN | per carton | weight × Qty Pcs ÷ Pieces per Carton **(to confirm)** |
| POUCH | per carton | weight × Qty Ctn |
| POUCH | per piece | weight × Qty Ctn × Pieces per Carton (the pricing quantity, not the display pieces) |

Gram is converted to KG and ML to Liter (÷ 1000); the row stores the result with its unit (`KG` or `LITER`) **(to confirm)**. A product without weight has Total Weight 0, so a TO / ATO rate on it is refused.

**GST rate** defaults to the product's `defaultTaxRate` (itself pre-filled from the organization default), is editable per row and is snapshotted. Never hard-coded.

## 4. Totals and invoice-level values

```
Grand Total = Σ Gross Value of all rows        (automatic, read-only)
```
Also stored: Σ Value Excl Tax, Σ GST, Σ Value Incl GST, Σ Total Trade Offer, Σ Cost (internal).

Advance Tax, Further Tax and the ADT / invoice-level Special Discount are **optional Admin entries**. Blank or 0 counts as zero, is stored as `null` and is **not printed**. **Payable Value is always calculated** (D-31):

```
Payable Value (final invoice amount) = Grand Total + Advance Tax + Further Tax − ADT / invoice-level Special Discount
```
Owner's example: 100,000 + 2,000 + 1,000 − 3,000 = **100,000**. A discount larger than Grand Total + taxes is refused (422 on `adtDiscount`). A client-sent `payableValue` is ignored.

| Field | Stored | Printed |
|---|---|---|
| Grand Total | `grandTotal` | always |
| Advance Tax | `advanceTax` (null when blank / 0) | only when non-zero |
| Further Tax | `furtherTax` | only when non-zero |
| ADT / invoice-level Special Discount | `adtDiscount` | only when non-zero (shown as −) |
| Due Payment | `duePayment` — shop's previous outstanding credit, **snapshot only** | when > 0 |
| Payable Value | `payableValue` — calculated snapshot, NOT NULL | **always** — the final amount of this invoice |

**Ledger (D-30, D-31):** confirming the invoice debits the shop ledger with the **Payable Value** (not Grand Total alone), in the same transaction; cancelling credits back exactly that debit (refused if it would make the shop's balance negative — see product-requirements §4.5). A Payable Value of 0 posts no debit.

**Due Payment** is prefilled with the shop's current outstanding balance from the Shop Ledger (`ShopLedgerService.outstandingBalance`). It is only the invoice's printed snapshot: editing it never changes the Shop Ledger, the Payable Value or the ledger debit (D-9). There is no `Shop.credit` field.

## 5. Rounding and precision

- All math uses `decimal.js` (40 significant digits) with **ROUND_HALF_UP** — never JS floats.
- Rounded to 2 decimals: GST Amount, TO Amount, ATO Amount, Cost (Value Excl Tax and the sums are exact). Total Weight: 3 decimals. Examples: 756.724 → 756.72, 756.725 → 756.73, 0.045 → 0.05.
- Database: money `numeric(14,2)`, rates `numeric(14,4)` (TO / ATO) and `numeric(7,4)` (GST), weight `numeric(14,3)`. Strings over the API.
- Inputs: prices / discounts ≥ 0 with ≤ 2 decimals, TO / ATO ≥ 0 with ≤ 4 decimals, GST 0–100 with ≤ 2 decimals, quantities whole numbers ≤ 100,000.

## 6. Header, snapshots and numbering

| Section | Fields | Stored on Invoice |
|---|---|---|
| Shop information | Name, Address, Phone, Contact Person, NTN, STRN, CNIC, Channel (= shop category), Area | `shop*` columns, snapshotted on confirm |
| Distributor information | Name, Address, Town / City, Phone, NTN, STRN; currency | `distributor*` columns + `currency`, snapshotted |
| Invoice | Invoice Number, Invoice Date (Admin-chosen, default today in the org timezone) | `invoiceNumber`, `invoiceDate` |

Each **InvoiceItem** snapshots: product id / code / name / type, retail, trade and invoice-cost price, pieces per carton, weight + unit + basis, Qty Ctn, Qty Pcs, Total Weight + unit, GST rate, Value Excl Tax, GST, Value Incl GST, TO rate + amount, ATO rate + amount, Special Discount, Total Trade Offer, Gross Value, Cost. Old invoices are always shown from these snapshots. **No Rate Code** (D-27).

**Invoice number:** `organization invoice prefix + zero-padded counter` (first customer `M-` + 8 digits), allocated by the server inside the confirm transaction with a row-locked UPSERT on `OrganizationCounter(INVOICE)` → concurrent invoices never share a number, a rolled-back invoice leaves no gap, `@@unique([organizationId, invoiceNumber])` is the final net. The form shows the *proposed* next number; the real one is assigned on confirm. Admin may move the counter forward only (D-18).

## 7. Order → invoice (D-28)

| Order line (`quantityUnit`) | Invoice prefill |
|---|---|
| `PIECE` (TIN) | Qty Pcs = order quantity |
| `CARTON` (POUCH) | Qty Ctn = order quantity; Qty Pcs = Qty Ctn × Pieces per Carton |

Prices, GST rate and cost come from the product's **current** values. Only a `PENDING` order of the **same shop and organization** can be invoiced; the conditional `UPDATE … WHERE status = 'PENDING'` (row lock) plus `Invoice.orderId UNIQUE` make a second invoice for the same order impossible (409). Cancelled / invoiced orders → 409; another shop's order → 422; another organization's order → not found.

## 8. Implementation choices awaiting confirmation

1. TIN with a **per-carton** weight: Total Weight = weight × Qty Pcs ÷ Pieces per Carton (and it requires Pieces per Carton).
2. Gram / ML weights converted to KG / Liter, so TO / ATO rates apply per kg (or per liter for liquid products, see OQ-7).
3. A row whose Total Trade Offer exceeds its Value Incl GST is refused (Gross Value may not be negative).
4. An **inactive shop** cannot be invoiced (same rule as orders); inactive products cannot be invoiced (PRD §4.6).
5. The same product may appear on more than one row of an invoice.
6. Invoice date is editable (default today) with no restriction on past / future dates.
7. PDF: browser *Print / save as PDF* with a dedicated print stylesheet (A4 landscape). A server-generated PDF file is a later enhancement.
8. ~~Ledger debit = Grand Total~~ — confirmed by the owner as **Payable Value** (D-31).
