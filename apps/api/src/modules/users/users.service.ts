import { Injectable, NotFoundException } from '@nestjs/common';
import { type User } from '@mytraders/shared-types';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

const PUBLIC_USER_FIELDS = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: User['role'];
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

/**
 * Phase 1: read-only user access for the current organization (used as the first
 * tenant-isolated resource). Create / edit / deactivate comes with the Users module.
 */
@Injectable()
export class UsersService {
  constructor(private readonly db: TenantPrismaService) {}

  async list(): Promise<User[]> {
    const rows = await this.db.client.user.findMany({
      select: PUBLIC_USER_FIELDS,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toUser);
  }

  async get(id: string): Promise<User> {
    const row = await this.db.client.user.findFirst({ where: { id }, select: PUBLIC_USER_FIELDS });
    if (!row) throw new NotFoundException('User not found');
    return toUser(row);
  }
}

function toUser(row: UserRow): User {
  return {
    ...row,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
