import { Search } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useCurrentUser } from '@/features/auth/auth-context';
import { monthRange, shiftDate, todayIn } from '@/lib/format/date';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import { type Option } from './filter-options';

/** Responsive grid of filters (hidden when printing; the print header lists them instead). */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-3 [&>*]:w-full sm:[&>*]:w-48">
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'grid content-start gap-1 text-xs font-medium text-muted-foreground',
        className,
      )}
    >
      {label}
      {children}
    </label>
  );
}

/** From / To dates with "This month" and "Last month" shortcuts. */
export function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  const user = useCurrentUser();
  const thisMonth = monthRange(todayIn(user.organization?.timezone));
  const lastMonth = monthRange(shiftDate(thisMonth.from, -1));
  const is = (r: { from: string; to: string }) => r.from === from && r.to === to;
  return (
    <div className="grid content-start gap-1 sm:!w-auto">
      <span className="text-xs font-medium text-muted-foreground">Period</span>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            type="date"
            aria-label="From date"
            className="w-0 flex-1 sm:w-[9.5rem] sm:flex-none"
            value={from}
            max={to}
            onChange={(e) => e.target.value && onChange({ from: e.target.value, to })}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To date"
            className="w-0 flex-1 sm:w-[9.5rem] sm:flex-none"
            value={to}
            min={from}
            onChange={(e) => e.target.value && onChange({ from, to: e.target.value })}
          />
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={is(thisMonth) ? 'secondary' : 'ghost'}
            onClick={() => onChange(thisMonth)}
          >
            This month
          </Button>
          <Button
            size="sm"
            variant={is(lastMonth) ? 'secondary' : 'ghost'}
            onClick={() => onChange(lastMonth)}
          >
            Last month
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A labelled select whose first option means "no filter". */
export function SelectFilter({
  label,
  value,
  onChange,
  options,
  all = 'All',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  all?: string | null;
}) {
  return (
    <Field label={label}>
      <NativeSelect value={value} onChange={(e) => onChange(e.target.value)}>
        {all !== null && <option value="">{all}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

/** Text search that updates the report after typing stops. */
export function SearchFilter({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const debounced = useDebouncedValue(text.trim());
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [debounced]);
  return (
    <Field label={label}>
      <span className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </span>
    </Field>
  );
}
