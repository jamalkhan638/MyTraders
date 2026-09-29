import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateOrderBookerInput,
  type ListUsersQuery,
  type Paginated,
  type UpdateOrderBookerInput,
  type User,
} from '@mytraders/shared-types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PasswordService } from '../auth/password.service';

const PUBLIC_USER_FIELDS = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof PUBLIC_USER_FIELDS }>;

/**
 * Users of the caller's organization. Admins can list everyone; they can create and edit
 * ORDER_BOOKER accounts only (creating/editing Admins is not part of the MVP).
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async list(query: ListUsersQuery): Promise<Paginated<User>> {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { isActive: query.status === 'active' } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.client.user.findMany({
        where,
        select: PUBLIC_USER_FIELDS,
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.client.user.count({ where }),
    ]);
    return { items: rows.map(toUser), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<User> {
    const row = await this.db.client.user.findFirst({ where: { id }, select: PUBLIC_USER_FIELDS });
    if (!row) throw new NotFoundException('User not found');
    return toUser(row);
  }

  async createOrderBooker(input: CreateOrderBookerInput): Promise<User> {
    const passwordHash = await this.passwords.hash(input.password);
    const row = await this.withUniqueEmail(() =>
      this.db.client.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          role: 'ORDER_BOOKER',
          passwordHash,
        },
        select: PUBLIC_USER_FIELDS,
      }),
    );
    return toUser(row);
  }

  async updateOrderBooker(id: string, input: UpdateOrderBookerInput): Promise<User> {
    const target = await this.db.client.user.findFirst({ where: { id }, select: { role: true } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role !== 'ORDER_BOOKER') {
      throw new ForbiddenException('Only Order Booker accounts can be edited here');
    }

    const { password, ...fields } = input;
    const data: Prisma.UserUpdateManyMutationInput = { ...fields };
    if (password) data.passwordHash = await this.passwords.hash(password);

    await this.withUniqueEmail(() =>
      this.db.client.user.updateMany({ where: { id, role: 'ORDER_BOOKER' }, data }),
    );

    // Deactivation or a password reset ends the booker's existing sessions immediately.
    // (The access token is already rejected by the auth guard for inactive users.)
    if (input.isActive === false || password) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return this.get(id);
  }

  private async withUniqueEmail<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This email is already in use');
      }
      throw error;
    }
  }
}

function toUser(row: UserRow): User {
  return {
    ...row,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
