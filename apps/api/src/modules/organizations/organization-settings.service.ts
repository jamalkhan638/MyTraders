import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  type OrganizationSettings,
  type UpdateOrganizationSettings,
} from '@mytraders/shared-types';
import { type CounterKey, type Organization } from '@prisma/client';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { type TenantPrismaClient } from '../../prisma/tenant-scope';

type TenantTx = Parameters<Parameters<TenantPrismaClient['$transaction']>[0]>[0];

/**
 * Settings of the caller's own organization. All access goes through the tenant client,
 * so the Organization row and counters are always the current organization's.
 */
@Injectable()
export class OrganizationSettingsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async get(): Promise<OrganizationSettings> {
    return this.db.client.$transaction((tx) => this.read(tx));
  }

  async update(input: UpdateOrganizationSettings): Promise<OrganizationSettings> {
    const { nextInvoiceNumber, ...fields } = input;
    return this.db.client.$transaction(async (tx) => {
      if (Object.keys(fields).length > 0) {
        const { count } = await tx.organization.updateMany({ data: fields });
        if (count === 0) throw new NotFoundException('Organization not found');
      }
      if (nextInvoiceNumber !== undefined) {
        await this.moveCounterForward(tx, 'INVOICE', nextInvoiceNumber);
      }
      return this.read(tx);
    });
  }

  /**
   * Sets the next invoice number, e.g. to continue from the paper invoice book. It can only move
   * forward, so an already-used number can never be issued again.
   */
  private async moveCounterForward(tx: TenantTx, key: CounterKey, value: number): Promise<void> {
    const existing = await tx.organizationCounter.findFirst({ where: { key } });
    if (!existing) {
      await tx.organizationCounter.create({
        data: { organizationId: this.tenant.requireOrganizationId(), key, nextValue: value },
      });
      return;
    }
    // Conditional update is atomic with respect to concurrent invoice numbering.
    const { count } = await tx.organizationCounter.updateMany({
      where: { key, nextValue: { lte: value } },
      data: { nextValue: value },
    });
    if (count === 0) {
      throw new UnprocessableEntityException(
        `Next invoice number cannot be lower than ${existing.nextValue} (numbers already in use)`,
      );
    }
  }

  private async read(tx: TenantTx): Promise<OrganizationSettings> {
    const organization = await tx.organization.findFirst();
    if (!organization) throw new NotFoundException('Organization not found');
    const counters = await tx.organizationCounter.findMany();
    const next = (key: CounterKey) => counters.find((c) => c.key === key)?.nextValue ?? 1;
    return toSettings(organization, next('INVOICE'), next('ORDER'));
  }
}

function toSettings(
  org: Organization,
  nextInvoiceNumber: number,
  nextOrderNumber: number,
): OrganizationSettings {
  return {
    id: org.id,
    name: org.name,
    status: org.status,
    address: org.address,
    town: org.town,
    phone: org.phone,
    ntn: org.ntn,
    strn: org.strn,
    logoUrl: org.logoUrl,
    currency: org.currency,
    timezone: org.timezone,
    invoicePrefix: org.invoicePrefix,
    invoiceNumberDigits: org.invoiceNumberDigits,
    orderPrefix: org.orderPrefix,
    orderNumberDigits: org.orderNumberDigits,
    defaultTaxRate: org.defaultTaxRate.toString(),
    nextInvoiceNumber,
    nextOrderNumber,
    updatedAt: org.updatedAt.toISOString(),
  };
}
