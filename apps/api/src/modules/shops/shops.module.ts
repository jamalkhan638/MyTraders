import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';

@Module({
  imports: [LedgerModule],
  controllers: [ShopsController],
  providers: [ShopsService],
})
export class ShopsModule {}
