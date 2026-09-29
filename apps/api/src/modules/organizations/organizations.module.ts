import { Module } from '@nestjs/common';
import { OrganizationSettingsController } from './organization-settings.controller';
import { OrganizationSettingsService } from './organization-settings.service';

@Module({
  controllers: [OrganizationSettingsController],
  providers: [OrganizationSettingsService],
})
export class OrganizationsModule {}
