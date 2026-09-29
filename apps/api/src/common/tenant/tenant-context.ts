import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { type AuthContext } from '../types/auth-context';

const AUTH_KEY = 'auth';

/**
 * Request-scoped identity (AsyncLocalStorage via nestjs-cls). Set by JwtAuthGuard.
 * The organization id used for tenant isolation comes only from here.
 */
@Injectable()
export class TenantContext {
  constructor(private readonly cls: ClsService) {}

  set(auth: AuthContext): void {
    this.cls.set(AUTH_KEY, auth);
  }

  get(): AuthContext | undefined {
    return this.cls.isActive() ? this.cls.get<AuthContext | undefined>(AUTH_KEY) : undefined;
  }

  require(): AuthContext {
    const auth = this.get();
    if (!auth) throw new UnauthorizedException('Not authenticated');
    return auth;
  }

  /** Organization of the current user. Throws for users without one (SUPER_ADMIN). */
  requireOrganizationId(): string {
    const { organizationId } = this.require();
    if (!organizationId) {
      throw new ForbiddenException('This action requires an organization account');
    }
    return organizationId;
  }
}
