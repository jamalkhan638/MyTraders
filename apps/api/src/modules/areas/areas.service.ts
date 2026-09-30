import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type Area,
  type CreateAreaInput,
  type ListAreasQuery,
  normalizeName,
  type Paginated,
  type UpdateAreaInput,
} from '@mytraders/shared-types';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

const AREA_FIELDS = {
  id: true,
  name: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.AreaSelect;

type AreaRow = Prisma.AreaGetPayload<{ select: typeof AREA_FIELDS }>;

const DUPLICATE_NAME = 'An area with this name already exists';

/** Areas of the caller's organization (docs/product-requirements.md §4.3). */
@Injectable()
export class AreasService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async list(query: ListAreasQuery): Promise<Paginated<Area>> {
    const where: Prisma.AreaWhereInput = {
      ...(query.status ? { isActive: query.status === 'active' } : {}),
      ...(query.q ? { nameNormalized: { contains: normalizeName(query.q) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.client.area.findMany({
        where,
        select: AREA_FIELDS,
        orderBy: { nameNormalized: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.client.area.count({ where }),
    ]);
    return { items: rows.map(toArea), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<Area> {
    const row = await this.db.client.area.findFirst({ where: { id }, select: AREA_FIELDS });
    if (!row) throw new NotFoundException('Area not found');
    return toArea(row);
  }

  async create(input: CreateAreaInput): Promise<Area> {
    const row = await this.withUniqueName(() =>
      this.db.client.area.create({
        data: {
          // Same value the tenant client would inject; stated explicitly for the Prisma types.
          organizationId: this.tenant.requireOrganizationId(),
          name: input.name,
          nameNormalized: normalizeName(input.name),
        },
        select: AREA_FIELDS,
      }),
    );
    return toArea(row);
  }

  async update(id: string, input: UpdateAreaInput): Promise<Area> {
    const data: Prisma.AreaUpdateManyMutationInput = {};
    if (input.name !== undefined) {
      data.name = input.name;
      data.nameNormalized = normalizeName(input.name);
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const { count } = await this.withUniqueName(() =>
      this.db.client.area.updateMany({ where: { id }, data }),
    );
    if (count === 0) throw new NotFoundException('Area not found');
    return this.get(id);
  }

  private async withUniqueName<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(DUPLICATE_NAME);
      }
      throw error;
    }
  }
}

function toArea(row: AreaRow): Area {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
