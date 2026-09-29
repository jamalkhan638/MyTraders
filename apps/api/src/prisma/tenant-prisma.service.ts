import { Injectable } from '@nestjs/common';
import { TenantContext } from '../common/tenant/tenant-context';
import { PrismaService } from './prisma.service';
import { createTenantClient, type TenantPrismaClient } from './tenant-scope';

/**
 * The Prisma client business modules must use. Every query is automatically limited to the
 * organization of the authenticated user (see tenant-scope.ts).
 */
@Injectable()
export class TenantPrismaService {
  readonly client: TenantPrismaClient;

  constructor(prisma: PrismaService, tenant: TenantContext) {
    this.client = createTenantClient(prisma, () => tenant.requireOrganizationId());
  }
}
