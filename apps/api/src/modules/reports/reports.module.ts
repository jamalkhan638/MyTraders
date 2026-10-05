import { Module } from '@nestjs/common';
import { ExpensesModule } from '../expenses/expenses.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ProfitModule } from '../profit/profit.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** Reports (Phase 7) — composed from the profit, shop ledger and expense services. */
@Module({
  imports: [ProfitModule, LedgerModule, ExpensesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
