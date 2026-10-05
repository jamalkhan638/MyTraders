# Invoice Specification

> **Status: formulas NOT confirmed.** Nothing in this file marked `TBC` may be implemented until the owner supplies the rule and a worked example. Each confirmed formula gets a unit test built from a real invoice.

The invoice is a real FMCG distributor sale invoice (tax, trade offers, carton/piece quantities, weight), not `qty × price`.
Reference: the customer's current invoice (Ali Akbar Traders, `M-00000001`).

## 1. Principles

1. **One invoice form**, two entry paths:
   - **Direct sale** — Admin clicks *Create Invoice*, form opens blank.
   - **From order** — Admin opens a pending order; the same form opens prefilled with shop, products, quantities only.
2. Admin has full control over every row: product, quantities, rates, discounts; add/remove rows.
3. **Product holds defaults; InvoiceItem holds what was actually used.** Overriding a value on an invoice never changes the product master.
4. Frontend computes live totals with the shared calculator for UX. **Backend recomputes everything** from the inputs with the same calculator and ignores client-sent totals.
5. On confirm, one DB transaction: allocate invoice number → create invoice + items with snapshots → ledger entry for the shop → (if from order) mark order `INVOICED` (fails if not `PENDING`) → (optional) payment entry for amount paid now.
6. A confirmed invoice is **immutable**. Admin can **cancel** it (D-16): in one transaction the invoice becomes `CANCELLED` (with reason, user, time) and an `INVOICE_CANCELLATION` ledger credit equal to `invoiceAmount` reverses the debit. A payment recorded at invoice time stays as a normal payment. The linked order stays `INVOICED` (not reopened). Cancelled invoices are excluded from sales, profit and weight sold.

## 2. Header

| Section | Fields | Source |
|---|---|---|
| Shop information | Name, Address, NTN, STRN, CNIC, Contact Person, Channel (= shop category) | Shop — **snapshotted** |
| Distributor information | Name, Address, NTN, STRN, Phone, Town | Organization settings — **snapshotted** |
| Invoice | Invoice Number, Invoice Date | Generated / chosen by Admin (default today, org timezone) |

## 3. Line columns

| Column | Input or derived | Default source | Stored on InvoiceItem | Formula |
|---|---|---|---|---|
| Product Code | snapshot | Product | `productCode` | — |
| Product Name | snapshot | Product | `productName` | — |
| R.P / Pcs incl. tax | editable, display only | Product.retailPrice | `retailPrice` | never used in invoice math (D-26) |
| T.P / Pcs excl. FED | editable | Product.tradePrice | `tradePrice` | **drives the invoice value** (D-26); exact formula TBC |
| Qty (ctn) | editable | Order line with unit `CARTON` | `cartonQty` | **POUCH:** the pricing quantity. TIN: TBC |
| Qty (pcs) | editable / derived | Order line with unit `PIECE` | `pieceQty` | **TIN:** the pricing quantity. **POUCH:** display only, auto = Qty Ctn × Pieces per Carton (D-26) |
| Total Weight | derived | Product.weight / weightUnit / weightBasis | `totalWeightKg` | weight × pieces (basis PIECE) or × cartons (basis CARTON); Liter/ML TBC (OQ-7) |
| Value excl. tax | derived | — | `valueExclTax` | **TBC** |
| GST rate | editable | Product.defaultTaxRate (D-26) | `taxRate` | — |
| GST amount | derived | — | `taxAmount` | **TBC** |
| TO rate | editable | 0 | `toRate` | — |
| ATO rate | editable | 0 | `atoRate` | — |
| Special discount | editable | 0 | `specialDiscount` | **TBC** |
| Total trade offer | derived | — | `tradeOffer` | **TBC** |
| Gross invoice value | derived | — | `grossValue` | **TBC** |
| (hidden) Cost | snapshot | Product.invoiceCostPrice | `unitCost`, `costTotal` | profit only, never in invoice totals; pricing qty × unit cost (D-26) |

### Prefilling from an order (D-28)
An order line carries `quantity` and `quantityUnit`, fixed when the order was booked:

| Order line | Invoice Qty (ctn) | Invoice Qty (pcs) |
|---|---|---|
| `PIECE` (TIN) | TBC | = order quantity |
| `CARTON` (POUCH) | = order quantity | = order quantity × Product.piecesPerCarton (display only) |

The order itself holds no prices; trade price, cost and tax rate come from the product when the invoice is created.

## 4. Totals / footer

| Line | Stored on Invoice | Formula |
|---|---|---|
| Grand Total | `grandTotal` | **TBC** (likely Σ gross value) |
| Further Tax | `furtherTax` | **TBC** (when does it apply? rate?) |
| Credit Balance (shop's previous outstanding, printed only if > 0) | `previousBalance` | shop balance **before** this invoice, snapshotted at confirm |
| Payable Value | `payableValue` | **TBC** |
| Amount paid now (optional) | `paidAmount` | creates a `PAYMENT` ledger entry |

**Ledger rule (confirmed, D-9):** the shop is debited with **this invoice's own amount** (`invoiceAmount`, TBC — expected Grand Total + Further Tax), **never** with the previous balance, otherwise old credit would be counted twice.

## 5. Rounding

TBC: per line or on totals; decimals (assumed 2). All math uses `Decimal`, never JS floats.

## 6. Observations from the reference invoice (NOT rules — for the formula conversation only)

From `M-00000001` (screen version):
- GST amount = 18% × Value excl. tax on all three rows.
- Total trade offer = TO rate × Total weight on all three rows (4.50, 2.25, 13.50).
- Gross invoice value = Value excl. tax + GST − Total trade offer (±0.01).
- Value excl. tax vs R.P fits rows 1–2 (≈ 97.18% of R.P / 1.18) but **not** row 3 (pouch 1×5).
- The photographed paper template contains `#REF!` and inconsistent weight/quantity values; it is not used as a numeric reference.

## 7. Questions to ask when the invoice module starts

For each: the rule + one worked example from a real invoice.
1. R.P and T.P — which one drives the value?
2. Value excl. tax
3. GST (and when FED applies)
4. TO — per kg? per carton? per piece?
5. ATO
6. Special discount — amount or percent? per line or per invoice?
7. Total trade offer
8. Gross invoice value
9. Further tax — which shops, what rate, on what base?
10. Payable value
11. ~~Qty ctn vs Qty pcs~~ — D-26: TIN priced by Qty Pcs, POUCH by Qty Ctn (Qty Pcs = Qty Ctn × Pieces per Carton). Order quantities: D-28 (TIN pieces, POUCH cartons). Still to confirm: Qty Ctn for a TIN.
12. Rounding
