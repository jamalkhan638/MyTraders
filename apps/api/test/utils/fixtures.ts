import { type PrismaService } from '../../src/prisma/prisma.service';

/** Direct-database fixtures for master data (bypass the API to keep tests focused). */
export function fixtures(prisma: PrismaService) {
  return {
    area: (organizationId: string, name: string, isActive = true) =>
      prisma.area.create({
        data: { organizationId, name, nameNormalized: name.toLowerCase(), isActive },
      }),
    product: (organizationId: string, name: string, isActive = true, code: string | null = null) =>
      prisma.product.create({
        data: {
          organizationId,
          name,
          code,
          codeNormalized: code?.toLowerCase() ?? null,
          type: 'TIN',
          retailPrice: '100',
          tradePrice: '90',
          invoiceCostPrice: '80',
          defaultTaxRate: '18',
          weight: '4.5',
          weightUnit: 'KG',
          weightBasis: 'PIECE',
          isActive,
        },
      }),
    shop: (
      organizationId: string,
      name: string,
      areaId: string,
      assignedOrderBookerId: string | null,
      isActive = true,
    ) =>
      prisma.shop.create({
        data: { organizationId, name, areaId, assignedOrderBookerId, isActive },
      }),
  };
}
