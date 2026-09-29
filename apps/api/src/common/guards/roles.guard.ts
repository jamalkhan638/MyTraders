import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type UserRole } from '@mytraders/shared-types';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators/access.decorators';

/** Global guard #2: role check. A route without @Roles or @Public is denied (default deny). */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, targets);
    if (!roles || roles.length === 0) {
      this.logger.error(
        `Route ${context.getClass().name}.${context.getHandler().name} has no @Roles`,
      );
      throw new ForbiddenException('Access to this route is not configured');
    }

    const auth = context.switchToHttp().getRequest<Request>().auth;
    if (!auth || !roles.includes(auth.role)) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    return true;
  }
}
