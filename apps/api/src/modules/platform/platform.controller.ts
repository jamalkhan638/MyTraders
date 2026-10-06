import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  createTenantSchema,
  listTenantsQuerySchema,
  platformSummarySchema,
  resetTenantAdminPasswordSchema,
  suspendTenantSchema,
  tenantDetailsSchema,
  tenantListSchema,
  UserRole,
} from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { PlatformService } from './platform.service';

class PlatformSummaryDto extends createZodDto(platformSummarySchema) {}
class TenantListDto extends createZodDto(tenantListSchema) {}
class ListTenantsQueryDto extends createZodDto(listTenantsQuerySchema) {}
class TenantDetailsDto extends createZodDto(tenantDetailsSchema) {}
class CreateTenantDto extends createZodDto(createTenantSchema) {}
class SuspendTenantDto extends createZodDto(suspendTenantSchema) {}
class ResetTenantAdminPasswordDto extends createZodDto(resetTenantAdminPasswordSchema) {}

/**
 * Platform tenant management — SUPER_ADMIN only (docs/permissions.md, D-38). Dedicated routes:
 * the Super Admin never calls tenant business APIs, and these routes never return business data.
 */
@ApiTags('platform')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('summary')
  @ApiOkResponse({ type: PlatformSummaryDto })
  summary() {
    return this.platform.summary();
  }

  @Get('tenants')
  @ApiOkResponse({ type: TenantListDto })
  list(@Query() query: ListTenantsQueryDto) {
    return this.platform.list(query);
  }

  @Post('tenants')
  @ApiCreatedResponse({ type: TenantDetailsDto, description: 'Tenant + first Admin, ACTIVE' })
  @ApiConflictResponse({ description: 'Admin email already used' })
  create(@Body() body: CreateTenantDto) {
    return this.platform.create(body);
  }

  @Get('tenants/:id')
  @ApiOkResponse({ type: TenantDetailsDto })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.get(id);
  }

  @Post('tenants/:id/activate')
  @HttpCode(200)
  @ApiOkResponse({ type: TenantDetailsDto, description: 'Activate or reactivate' })
  @ApiConflictResponse({ description: 'Already active' })
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.activate(id);
  }

  @Post('tenants/:id/suspend')
  @HttpCode(200)
  @ApiOkResponse({ type: TenantDetailsDto, description: 'Blocks every user of the tenant at once' })
  @ApiConflictResponse({ description: 'Already suspended' })
  suspend(@Param('id', ParseUUIDPipe) id: string, @Body() body: SuspendTenantDto) {
    return this.platform.suspend(id, body.reason);
  }

  @Post('tenants/:id/admins/:userId/password')
  @HttpCode(204)
  @ApiNoContentResponse({ description: "New password set; the Admin's sessions end" })
  @ApiNotFoundResponse({ description: 'Not an Admin of this tenant' })
  resetAdminPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ResetTenantAdminPasswordDto,
  ) {
    return this.platform.resetAdminPassword(id, userId, body.password);
  }
}
