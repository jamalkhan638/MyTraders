import { Module } from '@nestjs/common';
import { ShopLedgerPort } from './shop-ledger.port';

/** Shop ledger (credit / payments). Phase 5 fills it in; for now only the invoice integration point. */
@Module({
  providers: [ShopLedgerPort],
  exports: [ShopLedgerPort],
})
export class LedgerModule {}
