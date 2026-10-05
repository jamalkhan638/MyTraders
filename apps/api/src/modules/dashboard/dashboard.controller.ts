import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { dashboardSummarySchema, UserRole } from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { DashboardService } from './dashboard.service';

class DashboardSummaryDto extends createZodDto(dashboardSummarySchema) {}

/** Admin dashboard — every card in one response (D-34). Admin only. */
@ApiTags('dashboard')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @ApiOkResponse({
    type: DashboardSummaryDto,
    description: 'Current month in the organization timezone',
  })
  summary() {
    return this.dashboard.summary();
  }
}
