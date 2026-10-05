import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { profitQuerySchema, profitSummarySchema, UserRole } from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { ProfitService } from './profit.service';

class ProfitQueryDto extends createZodDto(profitQuerySchema) {}
class ProfitSummaryDto extends createZodDto(profitSummarySchema) {}

/** Profit figures for the Dashboard / Reports (D-33) — Admin only. */
@ApiTags('profit')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('profit')
export class ProfitController {
  constructor(private readonly profit: ProfitService) {}

  @Get('summary')
  @ApiOkResponse({
    type: ProfitSummaryDto,
    description:
      'Gross Profit = Σ (Payable Value − cost) of confirmed invoices; Net = Gross − expenses. Default: current month',
  })
  summary(@Query() query: ProfitQueryDto) {
    return this.profit.summary(query);
  }
}
