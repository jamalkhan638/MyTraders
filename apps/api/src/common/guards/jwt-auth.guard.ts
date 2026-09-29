import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/access.decorators';
import { TenantContext } from '../tenant/tenant-context';
import { type AuthContext } from '../types/auth-context';

export interface AccessTokenPayload {
  sub: string;
  org: string | null;
  role: AuthContext['role'];
}

/**
 * Global guard #1: verifies the Bearer access token, then reloads the user from the database
 * so deactivated users, suspended organizations and role changes take effect immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);
    if (!token) throw new UnauthorizedException('Missing access token');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        organizationId: true,
        role: true,
        isActive: true,
        organization: { select: { status: true } },
      },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Account is not active');
    if (user.organization?.status === 'SUSPENDED') {
      throw new UnauthorizedException('Organization is suspended');
    }
    if (user.organizationId !== payload.org || user.role !== payload.role) {
      throw new UnauthorizedException('Session is outdated, please sign in again');
    }

    const auth: AuthContext = {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    };
    request.auth = auth;
    this.tenant.set(auth);
    return true;
  }
}

function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
}
