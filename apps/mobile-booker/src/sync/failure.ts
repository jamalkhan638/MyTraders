import { ApiError } from '../api/errors';
import { type LocalOrder } from '../db/repo';

/**
 * Turns the server's refusal of an order into a sentence the booker can act on. The server is
 * the authority: it checks the shop and every product against today's data (D-46).
 */
export function explainRejection(order: LocalOrder, error: ApiError): string {
  if (error.status === 409) {
    return 'This order could not be matched on the server. Discard it and book it again.';
  }
  const reasons = error.details.map((d) => {
    if (d.path === 'shopId') {
      return /inactive/i.test(d.message)
        ? `${order.shopName} is no longer active. This order cannot be sent.`
        : `${order.shopName} is no longer assigned to you. This order cannot be sent.`;
    }
    const line = /^items\.(\d+)\.(\w+)$/.exec(d.path);
    if (line) {
      const item = order.items[Number(line[1])];
      const name = item?.productName ?? 'A product';
      if (line[2] === 'productId') {
        return `Product ${name} is no longer active. Edit the order and try again.`;
      }
      return `${name}: ${d.message}`;
    }
    return d.message;
  });
  return reasons.length > 0 ? [...new Set(reasons)].join(' ') : error.message;
}

/** Wait before the next automatic try of a temporary failure: 30 s, 1, 2, 4 … up to 15 min. */
export function backoffMs(attempts: number): number {
  return Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
}

/** 5xx / 429 / 408: the server had a problem; trying again later can work. */
export function isTemporary(error: ApiError): boolean {
  return error.status >= 500 || error.status === 429 || error.status === 408;
}
