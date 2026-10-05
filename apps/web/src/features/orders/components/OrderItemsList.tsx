import { type OrderDetails } from '@mytraders/shared-types';
import { QUANTITY_UNIT_LABELS } from '@mytraders/shared-types';
import { weightLabel } from '@/lib/format/product';

/** Products and quantities of an order (no prices — D-24 / orders carry none). */
export function OrderItemsList({ order }: { order: OrderDetails }) {
  return (
    <ul className="divide-y">
      {order.items.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="font-medium">
              {item.product.name}
              {!item.product.isActive && (
                <span className="ml-1.5 text-xs font-normal text-destructive">(inactive)</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {[
                item.product.code,
                item.product.type,
                item.product.weight && weightLabel(item.product),
              ]
                .filter(Boolean)
                .join(' · ') || '—'}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <span className="text-lg font-semibold tabular-nums">{item.quantity}</span>
            <span className="ml-1 text-xs text-muted-foreground">
              {QUANTITY_UNIT_LABELS[item.quantityUnit].toLowerCase()}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
