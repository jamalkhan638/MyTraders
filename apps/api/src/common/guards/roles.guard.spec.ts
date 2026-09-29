import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@mytraders/shared-types';
import { Public, Roles } from '../decorators/access.decorators';
import { type AuthContext } from '../types/auth-context';
import { RolesGuard } from './roles.guard';

class Handlers {
  @Roles(UserRole.ADMIN)
  adminOnly() {}

  @Public()
  open() {}

  nothingDeclared() {}
}

function contextFor(handler: keyof Handlers, auth?: AuthContext): ExecutionContext {
  return {
    getHandler: () => Handlers.prototype[handler],
    getClass: () => Handlers,
    switchToHttp: () => ({ getRequest: () => ({ auth }) }),
  } as unknown as ExecutionContext;
}

const user = (role: UserRole): AuthContext => ({ userId: 'u', organizationId: 'o', role });

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows a user whose role is listed', () => {
    expect(guard.canActivate(contextFor('adminOnly', user(UserRole.ADMIN)))).toBe(true);
  });

  it('forbids a user whose role is not listed', () => {
    expect(() => guard.canActivate(contextFor('adminOnly', user(UserRole.ORDER_BOOKER)))).toThrow(
      ForbiddenException,
    );
  });

  it('denies routes without @Roles by default', () => {
    expect(() => guard.canActivate(contextFor('nothingDeclared', user(UserRole.ADMIN)))).toThrow(
      ForbiddenException,
    );
  });

  it('lets public routes through', () => {
    expect(guard.canActivate(contextFor('open'))).toBe(true);
  });
});
