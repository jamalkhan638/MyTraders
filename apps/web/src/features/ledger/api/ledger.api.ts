import {
  type AdjustCreditInput,
  type AreaLedger,
  type AreaLedgerQueryInput,
  type LedgerPosting,
  type RecordPaymentInput,
  type ShopLedger,
  type ShopLedgerQueryInput,
} from '@mytraders/shared-types';
import { apiFetch } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';

export const ledgerApi = {
  shopLedger: (shopId: string, params: ShopLedgerQueryInput) =>
    apiFetch<ShopLedger>(`/shops/${shopId}/ledger${toQueryString(params)}`),
  recordPayment: (shopId: string, body: RecordPaymentInput) =>
    apiFetch<LedgerPosting>(`/shops/${shopId}/payments`, { method: 'POST', json: body }),
  adjust: (shopId: string, body: AdjustCreditInput) =>
    apiFetch<LedgerPosting>(`/shops/${shopId}/adjustments`, { method: 'POST', json: body }),
  areaLedger: (areaId: string, params: AreaLedgerQueryInput) =>
    apiFetch<AreaLedger>(`/ledger/areas/${areaId}${toQueryString(params)}`),
};
