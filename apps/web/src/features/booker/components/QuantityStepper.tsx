import { ORDER_MAX_QUANTITY } from '@mytraders/shared-types';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** Large − / + buttons with a number field in the middle (touch-friendly, ≥ 44px targets). */
export function QuantityStepper({
  value,
  onChange,
  label,
  unitLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  /** product name, for screen readers */
  label: string;
  /** "Qty (Pcs)" or "Qty (Ctn)" — shown above the field */
  unitLabel: string;
}) {
  const [text, setText] = useState<string | null>(null);

  const commit = (raw: string) => {
    setText(null);
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    onChange(Math.min(Math.max(parsed, 0), ORDER_MAX_QUANTITY));
  };

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground" aria-hidden>
        {unitLabel}
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          onClick={() => onChange(value - 1)}
          aria-label={`Decrease ${label}`}
        >
          <Minus />
        </Button>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={`${unitLabel} of ${label}`}
          className="h-11 w-16 rounded-md border border-input bg-card text-center text-base font-semibold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
          value={text ?? String(value)}
          onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          disabled={value >= ORDER_MAX_QUANTITY}
          onClick={() => onChange(value + 1)}
          aria-label={`Increase ${label}`}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}
