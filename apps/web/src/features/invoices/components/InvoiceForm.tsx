import {
  type CalculatedInvoiceLine,
  calculateInvoiceLine,
  calculateInvoiceTotals,
  type CreateInvoiceInput,
  createInvoiceSchema,
  type InvoiceDraft,
  type InvoiceLineField,
  type Product,
} from '@mytraders/shared-types';
import { Check, FileText, Loader2, Plus, Replace, Trash2 } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api/client';
import { formatAmount, formatQuantity } from '@/lib/format/number';
import { cn } from '@/lib/utils';
import { useCreateInvoice } from '../hooks/useInvoices';
import { ProductPickerDialog } from './ProductPickerDialog';

/** One editable row. Inputs are kept as typed text; the shared calculator reads them. */
interface FormLine {
  key: string;
  product: Product;
  qtyCtn: string;
  qtyPcs: string;
  /** POUCH: Qty Pcs follows Qty Ctn × Pieces per Carton until the Admin types their own value */
  pcsEdited: boolean;
  retailPrice: string;
  tradePrice: string;
  gstRate: string;
  toRate: string;
  atoRate: string;
  specialDiscount: string;
}

type Errors = Record<string, string>;

let nextKey = 0;
const newKey = () => `line-${++nextKey}`;

const derivedPcs = (product: Product, qtyCtn: string) =>
  product.type === 'POUCH' && product.piecesPerCarton && /^\d+$/.test(qtyCtn)
    ? String(Number(qtyCtn) * product.piecesPerCarton)
    : '';

/** A new row from the product's current values. */
function lineFor(product: Product, qtyCtn: number | null, qtyPcs: number | null): FormLine {
  return {
    key: newKey(),
    product,
    qtyCtn: qtyCtn?.toString() ?? '',
    qtyPcs: qtyPcs?.toString() ?? '',
    pcsEdited: false,
    retailPrice: product.retailPrice,
    tradePrice: product.tradePrice,
    gstRate: product.defaultTaxRate,
    toRate: '0',
    atoRate: '0',
    specialDiscount: '0',
  };
}

const wholeOrNull = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null);

function calculate(line: FormLine) {
  return calculateInvoiceLine(
    {
      type: line.product.type,
      piecesPerCarton: line.product.piecesPerCarton,
      weight: line.product.weight,
      weightUnit: line.product.weightUnit,
      weightBasis: line.product.weightBasis,
    },
    {
      qtyCtn: wholeOrNull(line.qtyCtn),
      qtyPcs: wholeOrNull(line.qtyPcs),
      tradePrice: line.tradePrice,
      gstRate: line.gstRate,
      toRate: line.toRate.trim() === '' ? '0' : line.toRate,
      atoRate: line.atoRate.trim() === '' ? '0' : line.atoRate,
      specialDiscount: line.specialDiscount.trim() === '' ? '0' : line.specialDiscount,
    },
  );
}

/**
 * The one invoice form (docs/frontend-guidelines.md §7) for both entry points: a shop's direct
 * invoice (no rows) and a pending order (rows prefilled). Values shown here are a live preview with
 * the shared calculator; the server recomputes everything when the invoice is confirmed.
 */
export function InvoiceForm({ draft }: { draft: InvoiceDraft }) {
  const navigate = useNavigate();
  const currency = useCurrentUser().organization?.currency ?? '';
  const create = useCreateInvoice();
  const [lines, setLines] = useState<FormLine[]>(() =>
    draft.items.map((item) => lineFor(item.product, item.qtyCtn, item.qtyPcs)),
  );
  const [invoiceDate, setInvoiceDate] = useState(draft.invoiceDate);
  const [duePayment, setDuePayment] = useState(draft.duePayment ?? '');
  const [advanceTax, setAdvanceTax] = useState('');
  const [furtherTax, setFurtherTax] = useState('');
  const [adtDiscount, setAdtDiscount] = useState('');
  const [payableValue, setPayableValue] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [picker, setPicker] = useState<{ replaceKey: string | null } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const results = useMemo(() => lines.map(calculate), [lines]);
  const valid = results.map((r) => (r.issues.length === 0 ? r.line : null));
  const complete = lines.length > 0 && valid.every(Boolean);
  const totals = calculateInvoiceTotals(
    valid.filter((l): l is CalculatedInvoiceLine => l !== null),
  );
  const usedIds = new Set(lines.map((l) => l.product.id));
  const inactiveProducts = lines.filter((l) => !l.product.isActive);

  const edit = (key: string, patch: Partial<FormLine>) => {
    setErrors({});
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.qtyCtn !== undefined && !next.pcsEdited) {
          next.qtyPcs = derivedPcs(next.product, next.qtyCtn);
        }
        return next;
      }),
    );
  };

  const pick = (product: Product) => {
    setErrors({});
    const replaceKey = picker?.replaceKey;
    setPicker(null);
    if (!replaceKey) {
      setLines((current) => [
        ...current,
        lineFor(
          product,
          product.type === 'POUCH' ? 1 : null,
          product.type === 'POUCH' ? (product.piecesPerCarton ?? null) : 1,
        ),
      ]);
      return;
    }
    // Swapping keeps the quantity the Admin typed and takes the new product's prices.
    setLines((current) =>
      current.map((line) => {
        if (line.key !== replaceKey) return line;
        const pricing = line.product.type === 'POUCH' ? line.qtyCtn : line.qtyPcs;
        const fresh = lineFor(product, null, null);
        return product.type === 'POUCH'
          ? { ...fresh, key: line.key, qtyCtn: pricing, qtyPcs: derivedPcs(product, pricing) }
          : { ...fresh, key: line.key, qtyPcs: pricing };
      }),
    );
  };

  const payload = (): CreateInvoiceInput => ({
    shopId: draft.shop.id,
    orderId: draft.order?.id ?? null,
    invoiceDate,
    items: lines.map((line) => ({
      productId: line.product.id,
      qtyCtn: line.product.type === 'POUCH' ? wholeOrNull(line.qtyCtn) : null,
      qtyPcs: wholeOrNull(line.qtyPcs),
      retailPrice: line.retailPrice,
      tradePrice: line.tradePrice,
      gstRate: line.gstRate,
      toRate: line.toRate,
      atoRate: line.atoRate,
      specialDiscount: line.specialDiscount,
    })),
    advanceTax,
    furtherTax,
    adtDiscount,
    duePayment,
    payableValue,
    notes,
  });

  /** Client-side check before asking for confirmation (the server checks everything again). */
  const check = (): boolean => {
    const found: Errors = {};
    const parsed = createInvoiceSchema.safeParse(payload());
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        found[path] ??= issue.message;
      }
    }
    results.forEach((result, index) => {
      for (const issue of result.issues) found[`items.${index}.${issue.field}`] ??= issue.message;
    });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error('Please fix the highlighted fields');
      return false;
    }
    return true;
  };

  const submit = () => {
    create.mutate(payload(), {
      onSuccess: (invoice) => {
        toast.success(`Invoice ${invoice.invoiceNumber} confirmed`);
        navigate(`/invoices/${invoice.id}`, { replace: true });
      },
      onError: (error) => {
        setConfirming(false);
        if (error instanceof ApiError && error.body?.details?.length) {
          setErrors(Object.fromEntries(error.body.details.map((d) => [d.path, d.message])));
          toast.error(error.message);
        } else {
          toast.error(error instanceof ApiError ? error.message : 'Could not reach the server');
        }
      },
    });
  };

  const rowError = (index: number, field: InvoiceLineField) => errors[`items.${index}.${field}`];
  const blocked = !draft.shop.isActive;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Create invoice</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {draft.order ? (
              <>
                From order{' '}
                <Link to={`/orders/${draft.order.id}`} className="font-medium underline">
                  {draft.order.orderNumber}
                </Link>{' '}
                — edit anything before confirming.
              </>
            ) : (
              'Direct invoice — add the products sold.'
            )}
          </p>
        </div>
      </div>

      <Card className="py-4">
        <CardContent className="grid gap-5 px-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0 sm:col-span-2">
            <div className="text-xs text-muted-foreground">Shop</div>
            <div className="font-semibold">
              <Link to={`/shops/${draft.shop.id}`} className="hover:underline">
                {draft.shop.name}
              </Link>
              {!draft.shop.isActive && (
                <span className="ml-2 text-xs font-normal text-destructive">(inactive)</span>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {[draft.shop.address, draft.shop.area, draft.shop.category]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Invoice number</div>
            <div className="font-mono font-semibold">{draft.proposedInvoiceNumber}</div>
            <div className="text-xs text-muted-foreground">Assigned when you confirm</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Field label="Invoice date" id="invoiceDate" error={errors.invoiceDate}>
              <Input
                id="invoiceDate"
                type="date"
                className="h-9"
                value={invoiceDate}
                aria-invalid={!!errors.invoiceDate}
                onChange={(e) => {
                  setErrors({});
                  setInvoiceDate(e.target.value);
                }}
              />
            </Field>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Field
              label={`Due payment — previous credit (${currency})`}
              id="duePayment"
              error={errors.duePayment}
              hint={
                draft.duePayment === null
                  ? 'Printed on the invoice only. Automatic from the shop ledger once it is built (Phase 5).'
                  : 'From the shop ledger. Changing it here only changes this invoice, never the ledger.'
              }
            >
              <Input
                id="duePayment"
                inputMode="decimal"
                placeholder="0.00"
                className="h-9 max-w-48 text-right"
                value={duePayment}
                aria-invalid={!!errors.duePayment}
                onChange={(e) => {
                  setErrors({});
                  setDuePayment(e.target.value);
                }}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {blocked && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          This shop is inactive. Activate it before invoicing.
        </p>
      )}
      {inactiveProducts.length > 0 && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          {inactiveProducts.map((l) => l.product.name).join(', ')}{' '}
          {inactiveProducts.length === 1 ? 'is' : 'are'} no longer active — replace or remove{' '}
          {inactiveProducts.length === 1 ? 'it' : 'them'}.
        </p>
      )}

      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b px-4 py-3">
          <CardTitle className="text-base">
            Products <span className="font-normal text-muted-foreground">({lines.length})</span>
          </CardTitle>
          <Button size="sm" onClick={() => setPicker({ replaceKey: null })}>
            <Plus />
            Add product
          </Button>
        </CardHeader>
        {errors.items && <p className="px-4 pt-3 text-sm text-destructive">{errors.items}</p>}
        {lines.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <FileText className="size-6" />
            No products yet.
            <Button variant="outline" size="sm" onClick={() => setPicker({ replaceKey: null })}>
              <Plus />
              Add the first product
            </Button>
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[1500px] border-collapse text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th]:font-medium [&>th]:whitespace-nowrap">
                  <th className="sticky left-0 z-10 min-w-56 bg-muted !text-left">Product</th>
                  <th>R.P</th>
                  <th>Qty (Ctn)</th>
                  <th>Qty (Pcs)</th>
                  <th>Total weight</th>
                  <th>T.P</th>
                  <th>Value excl. tax</th>
                  <th>GST %</th>
                  <th>GST</th>
                  <th>Value incl. GST</th>
                  <th>TO rate</th>
                  <th>ATO rate</th>
                  <th>Special disc.</th>
                  <th>Total trade offer</th>
                  <th>Gross value</th>
                  <th>
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((line, index) => {
                  const calc = valid[index];
                  const isPouch = line.product.type === 'POUCH';
                  const cell = (
                    field: Exclude<keyof FormLine, 'key' | 'product' | 'pcsEdited'>,
                    label: string,
                    errorField: InvoiceLineField | null,
                    extra?: Partial<FormLine>,
                  ) => (
                    <NumberCell
                      label={`${label} — ${line.product.name}`}
                      value={line[field]}
                      error={errorField ? rowError(index, errorField) : undefined}
                      onChange={(value) => edit(line.key, { [field]: value, ...extra })}
                    />
                  );
                  return (
                    <tr key={line.key} className="align-top [&>td]:px-2 [&>td]:py-2">
                      <td className="sticky left-0 z-10 bg-card">
                        <div className="flex items-start gap-1.5">
                          <span className="pt-0.5 text-xs text-muted-foreground tabular-nums">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium">
                              {line.product.name}
                              {!line.product.isActive && (
                                <span className="ml-1 text-xs text-destructive">(inactive)</span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              <Badge variant="outline">{line.product.type}</Badge>
                              {line.product.code && (
                                <span className="font-mono">{line.product.code}</span>
                              )}
                              <button
                                type="button"
                                className="inline-flex items-center gap-0.5 text-primary hover:underline"
                                onClick={() => setPicker({ replaceKey: line.key })}
                                aria-label={`Change product ${line.product.name}`}
                              >
                                <Replace className="size-3" />
                                Change
                              </button>
                            </div>
                            {rowError(index, 'productId') && (
                              <p className="text-xs text-destructive">
                                {rowError(index, 'productId')}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{cell('retailPrice', 'Retail price', null)}</td>
                      <td>
                        {isPouch ? (
                          cell('qtyCtn', 'Qty (Ctn)', 'qtyCtn')
                        ) : (
                          <span className="block pt-1.5 text-right text-muted-foreground">—</span>
                        )}
                      </td>
                      <td>
                        {cell('qtyPcs', 'Qty (Pcs)', 'qtyPcs', isPouch ? { pcsEdited: true } : {})}
                        {isPouch && (
                          <p className="mt-0.5 text-right text-[11px] text-muted-foreground">
                            {line.pcsEdited ? (
                              <button
                                type="button"
                                className="text-primary hover:underline"
                                onClick={() =>
                                  edit(line.key, {
                                    pcsEdited: false,
                                    qtyPcs: derivedPcs(line.product, line.qtyCtn),
                                  })
                                }
                              >
                                reset to ctn × {line.product.piecesPerCarton}
                              </button>
                            ) : (
                              `display · ctn × ${line.product.piecesPerCarton ?? '?'}`
                            )}
                          </p>
                        )}
                      </td>
                      <Calc>
                        {calc
                          ? `${formatQuantity(calc.totalWeight)}${calc.totalWeightUnit ? ` ${calc.totalWeightUnit === 'KG' ? 'kg' : 'L'}` : ''}`
                          : '—'}
                      </Calc>
                      <td>{cell('tradePrice', 'Trade price', 'tradePrice')}</td>
                      <Calc>{formatAmount(calc?.valueExclTax)}</Calc>
                      <td>{cell('gstRate', 'GST rate', 'gstRate')}</td>
                      <Calc>{formatAmount(calc?.gstAmount)}</Calc>
                      <Calc>{formatAmount(calc?.valueInclGst)}</Calc>
                      <td>
                        {cell('toRate', 'TO rate', 'toRate')}
                        <Sub>
                          {calc && calc.toAmount !== '0.00' && `= ${formatAmount(calc.toAmount)}`}
                        </Sub>
                      </td>
                      <td>
                        {cell('atoRate', 'ATO rate', 'atoRate')}
                        <Sub>
                          {calc && calc.atoAmount !== '0.00' && `= ${formatAmount(calc.atoAmount)}`}
                        </Sub>
                      </td>
                      <td>{cell('specialDiscount', 'Special discount', 'specialDiscount')}</td>
                      <Calc>{formatAmount(calc?.totalTradeOffer)}</Calc>
                      <Calc strong>{formatAmount(calc?.grossValue)}</Calc>
                      <td>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => {
                            setErrors({});
                            setLines((current) => current.filter((l) => l.key !== line.key));
                          }}
                          aria-label={`Remove ${line.product.name}`}
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
        <Card className="py-4">
          <CardContent className="px-4">
            <Label htmlFor="notes" className="mb-1.5 block">
              Note (optional, internal)
            </Label>
            <Textarea
              id="notes"
              rows={3}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardContent className="space-y-2 px-4 text-sm">
            <SummaryRow label="Value excl. tax" value={totals.totalValueExclTax} />
            <SummaryRow label="GST" value={totals.totalGstAmount} />
            <SummaryRow label="Total trade offer" value={totals.totalTradeOffer} negative />
            <div className="flex items-baseline justify-between border-t pt-2">
              <span className="font-semibold">Grand total ({currency})</span>
              <span className="text-xl font-semibold tabular-nums" data-testid="grand-total">
                {complete ? formatAmount(totals.grandTotal) : '—'}
              </span>
            </div>
            {!complete && lines.length > 0 && (
              <p className="text-right text-xs text-destructive">
                Complete every row to see the grand total.
              </p>
            )}
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Optional — left blank they are not printed. No formula is applied.
              </p>
              <AmountInput
                id="advanceTax"
                label="Advance tax"
                value={advanceTax}
                onChange={setAdvanceTax}
                error={errors.advanceTax}
              />
              <AmountInput
                id="furtherTax"
                label="Further tax"
                value={furtherTax}
                onChange={setFurtherTax}
                error={errors.furtherTax}
              />
              <AmountInput
                id="adtDiscount"
                label="ADT / special discount"
                value={adtDiscount}
                onChange={setAdtDiscount}
                error={errors.adtDiscount}
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Due payment</span>
                <span className="tabular-nums">{formatAmount(duePayment || null)}</span>
              </div>
              <AmountInput
                id="payableValue"
                label="Payable value"
                value={payableValue}
                onChange={setPayableValue}
                error={errors.payableValue}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" asChild>
          <Link to={draft.order ? `/orders/${draft.order.id}` : `/shops/${draft.shop.id}`}>
            Cancel
          </Link>
        </Button>
        <Button
          disabled={blocked || lines.length === 0 || create.isPending}
          onClick={() => check() && setConfirming(true)}
        >
          <Check />
          Confirm invoice
        </Button>
      </div>

      <ProductPickerDialog
        open={picker !== null}
        title={picker?.replaceKey ? 'Change product' : 'Add product'}
        usedIds={usedIds}
        onPick={pick}
        onClose={() => setPicker(null)}
      />

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => !open && !create.isPending && setConfirming(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm this invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              {draft.shop.name} · {lines.length} product{lines.length === 1 ? '' : 's'} · grand
              total {currency} {formatAmount(totals.grandTotal)}. The server recalculates every
              value. A confirmed invoice cannot be edited.
              {draft.order && ` Order ${draft.order.orderNumber} will be marked invoiced.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={create.isPending}>Back to the invoice</AlertDialogCancel>
            <AlertDialogAction
              disabled={create.isPending}
              onClick={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              {create.isPending && <Loader2 className="animate-spin" />}
              Confirm invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NumberCell({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="ml-auto w-24">
      <input
        aria-label={label}
        inputMode="decimal"
        value={value}
        title={error}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-8 w-full rounded-md border border-input bg-card px-2 text-right text-sm tabular-nums outline-none',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30',
          error && 'border-destructive ring-destructive/20',
        )}
      />
      {error && (
        <p className="mt-0.5 text-right text-[11px] leading-tight text-destructive">{error}</p>
      )}
    </div>
  );
}

function Calc({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <td
      className={cn('pt-3.5 text-right whitespace-nowrap tabular-nums', strong && 'font-semibold')}
    >
      {children}
    </td>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return (
    <p className="mt-0.5 text-right text-[11px] text-muted-foreground tabular-nums">{children}</p>
  );
}

function SummaryRow({
  label,
  value,
  negative,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        {negative && value !== '0.00' ? '− ' : ''}
        {formatAmount(value)}
      </span>
    </div>
  );
}

function AmountInput({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="font-normal text-muted-foreground">
          {label}
        </Label>
        <Input
          id={id}
          inputMode="decimal"
          placeholder="—"
          className="h-8 w-36 text-right"
          value={value}
          aria-invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {error && <p className="text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Field({
  label,
  id,
  error,
  hint,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
