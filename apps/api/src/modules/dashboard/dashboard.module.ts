import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { OrdersModule } from '../orders/orders.module';
import { ProfitModule } from '../profit/profit.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [OrdersModule, LedgerModule, ProfitModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
