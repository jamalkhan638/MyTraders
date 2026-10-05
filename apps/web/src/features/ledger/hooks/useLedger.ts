import {
  type AdjustCreditInput,
  type AreaLedgerQueryInput,
  type RecordPaymentInput,
  type ShopLedgerQueryInput,
} from '@mytraders/shared-types';
import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { shopsKeys } from '@/features/shops/hooks/useShops';
import { ledgerApi } from '../api/ledger.api';

export const ledgerKeys = {
  all: ['ledger'] as const,
  shop: (shopId: string, params: ShopLedgerQueryInput) =>
    ['ledger', 'shop', shopId, params] as const,
  area: (areaId: string, params: AreaLedgerQueryInput) =>
    ['ledger', 'area', areaId, params] as const,
};

/**
 * Anything that posts to the ledger changes balances shown in several places (shop details, shop
 * list, area sheet, invoice draft): refresh them all from the server.
 */
export function invalidateBalances(queryClient: QueryClient, { drafts = true } = {}) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ledgerKeys.all }),
    queryClient.invalidateQueries({ queryKey: shopsKeys.all }),
    // an open invoice form's Due Payment follows the balance
    drafts && queryClient.invalidateQueries({ queryKey: ['invoices', 'draft'] }),
  ]);
}

export function useShopLedger(shopId: string, params: ShopLedgerQueryInput) {
  return useQuery({
    queryKey: ledgerKeys.shop(shopId, params),
    queryFn: () => ledgerApi.shopLedger(shopId, params),
    placeholderData: keepPreviousData,
  });
}

export function useAreaLedger(areaId: string, params: AreaLedgerQueryInput) {
  return useQuery({
    queryKey: ledgerKeys.area(areaId, params),
    queryFn: () => ledgerApi.areaLedger(areaId, params),
    enabled: areaId !== '',
    placeholderData: keepPreviousData,
  });
}

export function useRecordPayment(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RecordPaymentInput) => ledgerApi.recordPayment(shopId, body),
    onSuccess: () => invalidateBalances(queryClient),
  });
}

export function useAdjustCredit(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AdjustCreditInput) => ledgerApi.adjust(shopId, body),
    onSuccess: () => invalidateBalances(queryClient),
  });
}
