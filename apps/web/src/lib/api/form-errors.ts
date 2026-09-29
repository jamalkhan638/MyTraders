import { toast } from 'sonner';
import { ApiError } from './client';

type SetError = (name: never, error: { type: string; message: string }) => void;

/**
 * Shows a failed mutation to the user: validation errors go onto matching form fields,
 * a 409 conflict (a unique value such as an email is taken) goes onto `conflictField`,
 * everything else becomes a toast. Returns true if at least one field error was set.
 */
export function showApiError(
  error: unknown,
  setError?: SetError,
  fields: readonly string[] = [],
  conflictField?: string,
): boolean {
  if (error instanceof ApiError) {
    if (error.status === 409 && setError && conflictField) {
      setError(conflictField as never, { type: 'server', message: error.message });
      return true;
    }
    const details = error.body?.details ?? [];
    let applied = false;
    for (const detail of details) {
      if (setError && fields.includes(detail.path)) {
        setError(detail.path as never, { type: 'server', message: detail.message });
        applied = true;
      }
    }
    if (!applied) toast.error(error.message);
    return applied;
  }
  toast.error('Could not reach the server. Check your connection and try again.');
  return false;
}
