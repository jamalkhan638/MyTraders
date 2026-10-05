import { Module } from '@nestjs/common';
import { LedgerController, ShopLedgerController } from './ledger.controller';
import { ShopLedgerService } from './shop-ledger.service';

/** Shop ledger: the single source of truth for shop credit (D-30). */
@Module({
  controllers: [ShopLedgerController, LedgerController],
  providers: [ShopLedgerService],
  exports: [ShopLedgerService],
})
export class LedgerModule {}
