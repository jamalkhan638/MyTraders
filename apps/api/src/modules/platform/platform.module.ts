import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

/** Platform tenant management for the Super Admin (D-38). */
@Module({
  imports: [AuthModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
