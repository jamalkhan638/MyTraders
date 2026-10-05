import { Module } from '@nestjs/common';
import { ExpensesModule } from '../expenses/expenses.module';
import { ProfitController } from './profit.controller';
import { ProfitService } from './profit.service';

@Module({
  imports: [ExpensesModule],
  controllers: [ProfitController],
  providers: [ProfitService],
  exports: [ProfitService],
})
export class ProfitModule {}
