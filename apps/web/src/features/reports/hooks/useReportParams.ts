import { useSearchParams } from 'react-router';
import { useCurrentUser } from '@/features/auth/auth-context';
import { monthRange, todayIn } from '@/lib/format/date';

/**
 * Report filters live in the URL (shareable, survive a reload). Dates default to the current
 * month in the organization timezone — the same default the server applies.
 */
export function useReportParams() {
  const user = useCurrentUser();
  const month = monthRange(todayIn(user.organization?.timezone));
  const [params, setParams] = useSearchParams();
  const get = (key: string, fallback = '') => params.get(key) ?? fallback;
  const set = (patch: Record<string, string>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  return {
    get,
    set,
    from: get('from', month.from),
    to: get('to', month.to),
    /** query value: undefined when empty, so it is left out of the request */
    opt: (key: string) => params.get(key) || undefined,
  };
}
