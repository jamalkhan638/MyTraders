import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  organizationSettingsSchema,
  updateOrganizationSettingsSchema,
  UserRole,
} from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { OrganizationSettingsService } from './organization-settings.service';

class OrganizationSettingsDto extends createZodDto(organizationSettingsSchema) {}
class UpdateOrganizationSettingsDto extends createZodDto(updateOrganizationSettingsSchema) {}

@ApiTags('organization')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('organization/settings')
export class OrganizationSettingsController {
  constructor(private readonly settings: OrganizationSettingsService) {}

  @Get()
  @ApiOkResponse({ type: OrganizationSettingsDto })
  get() {
    return this.settings.get();
  }

  @Patch()
  @ApiOkResponse({ type: OrganizationSettingsDto })
  update(@Body() body: UpdateOrganizationSettingsDto) {
    return this.settings.update(body);
  }
}
