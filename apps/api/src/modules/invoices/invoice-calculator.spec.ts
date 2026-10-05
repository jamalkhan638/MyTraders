import {
  calculateInvoiceLine,
  calculatePayableValue,
  calculateInvoiceTotals,
  initialQuantities,
  type InvoiceLineValues,
  type InvoiceProductFacts,
  optionalInvoiceAmount,
} from '@mytraders/shared-types';

/** The owner's formulas (D-29) with the worked examples from the invoice instructions. */
const TIN: InvoiceProductFacts = {
  type: 'TIN',
  piecesPerCarton: null,
  weight: '4.5',
  weightUnit: 'KG',
  weightBasis: 'PIECE',
};
const POUCH: InvoiceProductFacts = {
  type: 'POUCH',
  piecesPerCarton: 5,
  weight: '4.5',
  weightUnit: 'KG',
  weightBasis: 'CARTON',
};
const values = (patch: Partial<InvoiceLineValues> = {}): InvoiceLineValues => ({
  tradePrice: '2102',
  gstRate: '18',
  toRate: '0',
  atoRate: '0',
  specialDiscount: '0',
  ...patch,
});
const line = (product: InvoiceProductFacts, patch: Partial<InvoiceLineValues>) => {
  const result = calculateInvoiceLine(product, values(patch));
  expect(result.issues).toEqual([]);
  return result.line!;
};

describe('invoice calculator', () => {
  describe('quantities', () => {
    it('POUCH: Value Excl Tax = Qty Ctn × Trade Price (2 × 2,102 = 4,204, not 10 × 2,102)', () => {
      const l = line(POUCH, { qtyCtn: 2 });
      expect(l).toMatchObject({ qtyCtn: 2, qtyPcs: 10, valueExclTax: '4204.00' });
    });

    it('POUCH: pieces are derived from Pieces per Carton and never change the value', () => {
      expect(initialQuantities(POUCH, 2)).toEqual({ qtyCtn: 2, qtyPcs: 10 });
      const edited = line(POUCH, { qtyCtn: 2, qtyPcs: 7 });
      expect(edited).toMatchObject({ qtyPcs: 7, valueExclTax: '4204.00', grossValue: '4960.72' });
    });

    it('TIN: Value Excl Tax = Qty Pcs × Trade Price; Qty Ctn is not used', () => {
      expect(initialQuantities(TIN, 3)).toEqual({ qtyCtn: null, qtyPcs: 3 });
      const l = line(TIN, { qtyPcs: 3, qtyCtn: 99, tradePrice: '2102.50' });
      expect(l).toMatchObject({ qtyCtn: null, qtyPcs: 3, valueExclTax: '6307.50' });
    });

    it('requires the pricing quantity of the product type', () => {
      expect(calculateInvoiceLine(TIN, values({ qtyCtn: 2 })).issues).toEqual([
        { field: 'qtyPcs', message: 'Enter Qty (Pcs) of at least 1' },
      ]);
      expect(calculateInvoiceLine(POUCH, values({ qtyPcs: 10 })).issues).toEqual([
        { field: 'qtyCtn', message: 'Enter Qty (Ctn) of at least 1' },
      ]);
      expect(calculateInvoiceLine(POUCH, values({ qtyCtn: 0 })).issues[0].field).toBe('qtyCtn');
    });
  });

  describe('GST', () => {
    it('GST Amount = Value Excl Tax × rate / 100; Value Incl GST = Value + GST (4,204 → 756.72 → 4,960.72)', () => {
      const l = line(POUCH, { qtyCtn: 2 });
      expect(l).toMatchObject({ gstAmount: '756.72', valueInclGst: '4960.72' });
    });

    it('uses the rate given, never a fixed 18%', () => {
      expect(line(POUCH, { qtyCtn: 2, gstRate: '17' }).gstAmount).toBe('714.68');
      expect(line(POUCH, { qtyCtn: 2, gstRate: '0' }).gstAmount).toBe('0.00');
      expect(line(POUCH, { qtyCtn: 2, gstRate: '17.5' }).gstAmount).toBe('735.70');
    });

    it('rounds half up to 2 decimals (756.725 → 756.73, 756.724 → 756.72)', () => {
      // 4204.03 × 18% = 756.7254 → 756.73 ; 4204.02 × 18% = 756.7236 → 756.72
      expect(line(TIN, { qtyPcs: 1, tradePrice: '4204.03' }).gstAmount).toBe('756.73');
      expect(line(TIN, { qtyPcs: 1, tradePrice: '4204.02' }).gstAmount).toBe('756.72');
      // exactly half: 0.25 × 18% = 0.045 → 0.05 (banker's rounding would give 0.04)
      expect(line(TIN, { qtyPcs: 1, tradePrice: '0.25' }).gstAmount).toBe('0.05');
    });
  });

  describe('weight, TO and ATO', () => {
    it('TO Amount = TO Rate × Total Weight; ATO likewise (9 kg: 5 → 45, 3 → 27)', () => {
      const l = line(POUCH, { qtyCtn: 2, toRate: '5', atoRate: '3' });
      expect(l).toMatchObject({
        totalWeight: '9.000',
        totalWeightUnit: 'KG',
        toAmount: '45.00',
        atoAmount: '27.00',
      });
    });

    it('Total Trade Offer = TO + ATO + Special Discount; Gross = Value Incl GST − Trade Offer', () => {
      const l = line(POUCH, { qtyCtn: 2, toRate: '5', atoRate: '3', specialDiscount: '10' });
      expect(l).toMatchObject({ totalTradeOffer: '82.00', grossValue: '4878.72' });
    });

    it('weight follows the stored basis and unit, not the product name', () => {
      expect(line(TIN, { qtyPcs: 2 }).totalWeight).toBe('9.000');
      const perPiecePouch = { ...POUCH, weight: '1', weightBasis: 'PIECE' as const };
      expect(line(perPiecePouch, { qtyCtn: 2, qtyPcs: 1 }).totalWeight).toBe('10.000');
      const perCartonTin = {
        ...TIN,
        weight: '27',
        weightBasis: 'CARTON' as const,
        piecesPerCarton: 6,
      };
      expect(line(perCartonTin, { qtyPcs: 4 }).totalWeight).toBe('18.000');
      const grams = { ...TIN, weight: '500', weightUnit: 'GRAM' as const };
      expect(line(grams, { qtyPcs: 3 })).toMatchObject({
        totalWeight: '1.500',
        totalWeightUnit: 'KG',
      });
      const ml = { ...POUCH, weight: '250', weightUnit: 'ML' as const };
      expect(line(ml, { qtyCtn: 2 })).toMatchObject({
        totalWeight: '0.500',
        totalWeightUnit: 'LITER',
      });
    });

    it('a product without weight has weight 0 and cannot carry TO / ATO', () => {
      const noWeight = { ...TIN, weight: null, weightUnit: null, weightBasis: null };
      expect(line(noWeight, { qtyPcs: 2 })).toMatchObject({
        totalWeight: '0.000',
        toAmount: '0.00',
      });
      expect(calculateInvoiceLine(noWeight, values({ qtyPcs: 2, toRate: '5' })).issues).toEqual([
        { field: 'toRate', message: 'This product has no weight, so TO cannot apply' },
      ]);
    });

    it('a TIN with a per-carton weight needs pieces per carton', () => {
      const broken = { ...TIN, weightBasis: 'CARTON' as const };
      expect(calculateInvoiceLine(broken, values({ qtyPcs: 2 })).issues[0].field).toBe('productId');
    });

    it('TO / ATO round half up to 2 decimals', () => {
      // 0.333 kg × 3 pcs = 0.999 kg × 1.005 = 1.003995 → 1.00
      const small = { ...TIN, weight: '0.333' };
      expect(line(small, { qtyPcs: 3, toRate: '1.005' }).toAmount).toBe('1.00');
      // 1.5 kg × 0.003 = 0.0045 → 0.00 ; × 0.0035 = 0.00525 → 0.01
      const kg = { ...TIN, weight: '1.5' };
      expect(line(kg, { qtyPcs: 1, toRate: '0.0035' }).toAmount).toBe('0.01');
    });

    it('rejects a trade offer larger than the value incl. GST', () => {
      const result = calculateInvoiceLine(
        TIN,
        values({ qtyPcs: 1, tradePrice: '10', specialDiscount: '50' }),
      );
      expect(result.issues).toEqual([
        { field: 'specialDiscount', message: 'Total trade offer is more than the value incl. GST' },
      ]);
    });
  });

  describe('prices that never affect the shop invoice', () => {
    it('Retail Price is not an input of the calculator at all', () => {
      // calculateInvoiceLine has no retail price parameter: R.P is a display snapshot only.
      const a = calculateInvoiceLine(TIN, { ...values({ qtyPcs: 2 }), retailPrice: '1' } as never);
      const b = calculateInvoiceLine(TIN, {
        ...values({ qtyPcs: 2 }),
        retailPrice: '99999',
      } as never);
      expect(a.line).toEqual(b.line);
    });

    it('Invoice/Cost Price only gives the cost (pricing qty × cost), never the value', () => {
      const cheap = line(POUCH, { qtyCtn: 2, invoiceCostPrice: '2050.25' });
      const dear = line(POUCH, { qtyCtn: 2, invoiceCostPrice: '3000' });
      expect(cheap.costTotal).toBe('4100.50');
      expect(dear.costTotal).toBe('6000.00');
      expect({ ...cheap, costTotal: null }).toEqual({ ...dear, costTotal: null });
      expect(line(TIN, { qtyPcs: 3, invoiceCostPrice: '10.10' }).costTotal).toBe('30.30');
    });
  });

  describe('totals', () => {
    it('Grand Total = Σ Gross Invoice Value (10,500.25 + 15,200.50 + 7,000.00 = 32,700.75)', () => {
      const gross = (g: string) => ({
        ...line(TIN, { qtyPcs: 1 }),
        grossValue: g,
      });
      const totals = calculateInvoiceTotals([
        gross('10500.25'),
        gross('15200.50'),
        gross('7000.00'),
      ]);
      expect(totals.grandTotal).toBe('32700.75');
    });

    it('adds decimals exactly (no floating-point drift over many lines)', () => {
      const lines = Array.from({ length: 30 }, () =>
        line(TIN, { qtyPcs: 1, tradePrice: '0.10', gstRate: '0' }),
      );
      expect(calculateInvoiceTotals(lines)).toMatchObject({
        totalValueExclTax: '3.00',
        grandTotal: '3.00',
      });
    });

    it('optional invoice-level amounts: blank or zero are not kept', () => {
      expect(optionalInvoiceAmount('')).toBeNull();
      expect(optionalInvoiceAmount(null)).toBeNull();
      expect(optionalInvoiceAmount('0')).toBeNull();
      expect(optionalInvoiceAmount('0.00')).toBeNull();
      expect(optionalInvoiceAmount('1250.5')).toBe('1250.50');
    });
  });

  describe('Payable Value (D-31)', () => {
    it("= Grand Total + Advance Tax + Further Tax − ADT discount (owner's example)", () => {
      expect(
        calculatePayableValue({
          grandTotal: '100000',
          advanceTax: '2000',
          furtherTax: '1000',
          adtDiscount: '3000',
        }),
      ).toBe('100000.00');
    });

    it('each part moves it the right way; blank counts as zero', () => {
      const g = { grandTotal: '7442.85' };
      expect(calculatePayableValue(g)).toBe('7442.85');
      expect(calculatePayableValue({ ...g, advanceTax: '', furtherTax: null })).toBe('7442.85');
      expect(calculatePayableValue({ ...g, advanceTax: '120.5' })).toBe('7563.35');
      expect(calculatePayableValue({ ...g, furtherTax: '300' })).toBe('7742.85');
      expect(calculatePayableValue({ ...g, adtDiscount: '50' })).toBe('7392.85');
    });

    it('is exact with decimals and can report a negative result to be refused', () => {
      expect(
        calculatePayableValue({ grandTotal: '0.10', advanceTax: '0.20', adtDiscount: '0.05' }),
      ).toBe('0.25');
      expect(calculatePayableValue({ grandTotal: '10', adtDiscount: '10.01' })).toBe('-0.01');
    });
  });
});
