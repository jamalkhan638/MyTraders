import { type DashboardSummary } from '@mytraders/shared-types';
import { useEffect, useRef, useState } from 'react';
import { formatAmount } from '@/lib/format/number';

const H = 220;
const PAD = { top: 24, right: 12, bottom: 28, left: 56 };
const BAR = 24; // column thickness cap (never fill the slot)

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

/** Round axis ticks: 0 and 4 steps of a 1 / 2 / 5 × 10ⁿ step. Geometry only — values stay strings. */
function ticks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

const compact = (value: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

/**
 * Monthly sales (Payable Value of confirmed invoices), last 6 months. One series → one color, no
 * legend; columns ≤ 24px with a rounded cap; hairline grid; the current month is labelled on its
 * cap; every column has a hover / focus tooltip; a table carries every value for screen readers.
 */
export function SalesChart({
  data,
  currency,
}: {
  data: DashboardSummary['salesByMonth'];
  currency: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  // Draw at the container's real width so text and columns keep their size on phones.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setW(Math.max(280, Math.round(entry.contentRect.width))),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const values = data.map((d) => Number(d.sales));
  const scale = ticks(Math.max(...values));
  const top = scale[scale.length - 1] || 1;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / data.length;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const empty = values.every((v) => v === 0);

  return (
    <div className="relative w-full min-w-0 overflow-hidden" ref={box}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block"
        role="img"
        aria-label={`Sales per month, ${data[0]?.month} to ${data[data.length - 1]?.month}`}
      >
        {scale.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(v)}
              dy="0.32em"
              textAnchor="end"
              className="fill-muted-foreground text-[11px]"
            >
              {compact(v)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const v = values[i];
          const cx = PAD.left + slot * i + slot / 2;
          const h = Math.max(0, PAD.top + plotH - y(v));
          const x = cx - BAR / 2;
          const yTop = PAD.top + plotH - h;
          const r = Math.min(4, h);
          const last = i === data.length - 1;
          return (
            <g
              key={d.month}
              tabIndex={0}
              role="button"
              aria-label={`${monthLabel(d.month)}: ${currency} ${formatAmount(d.sales)}`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="cursor-default outline-none"
            >
              {/* hit target: the whole slot, bigger than the mark */}
              <rect x={cx - slot / 2} y={PAD.top} width={slot} height={plotH} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${yTop + h} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + BAR - r} Q${x + BAR},${yTop} ${x + BAR},${yTop + r} V${yTop + h} Z`}
                  className={active === i ? 'fill-primary-hover' : 'fill-primary'}
                />
              )}
              {last && v > 0 && (
                <text
                  x={cx}
                  y={yTop - 6}
                  textAnchor="middle"
                  className="fill-foreground text-[11px] font-medium"
                >
                  {compact(v)}
                </text>
              )}
              <text
                x={cx}
                y={H - 8}
                textAnchor="middle"
                className={
                  last
                    ? 'fill-foreground text-[11px] font-medium'
                    : 'fill-muted-foreground text-[11px]'
                }
              >
                {monthLabel(d.month)}
              </text>
            </g>
          );
        })}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
          className="stroke-border"
          strokeWidth={1}
        />
      </svg>
      {empty && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          No confirmed invoices in the last 6 months.
        </p>
      )}
      {active !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-1 rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-sm"
          style={{
            left: `${((PAD.left + slot * active + slot / 2) / W) * 100}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="font-semibold tabular-nums">
            {currency} {formatAmount(data[active].sales)}
          </div>
          <div className="text-muted-foreground">{monthLabel(data[active].month)}</div>
        </div>
      )}
      <table className="sr-only">
        <caption>Sales per month</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Sales ({currency})</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <td>{monthLabel(d.month)}</td>
              <td>{formatAmount(d.sales)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
