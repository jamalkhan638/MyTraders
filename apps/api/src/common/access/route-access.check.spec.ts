import { Controller, Get } from '@nestjs/common';
import { MetadataScanner, Reflector } from '@nestjs/core';
import { UserRole } from '@mytraders/shared-types';
import { Public, Roles } from '../decorators/access.decorators';
import { findUnprotectedRoutes } from './route-access.check';

@Controller('ok')
class ProtectedController {
  @Public()
  @Get('a')
  a() {}

  @Roles(UserRole.ADMIN)
  @Get('b')
  b() {}

  helper() {} // not a route
}

@Roles(UserRole.ADMIN)
@Controller('class-level')
class ClassLevelController {
  @Get()
  list() {}
}

@Controller('bad')
class ForgottenController {
  @Get()
  forgotten() {}
}

describe('findUnprotectedRoutes', () => {
  const check = (...controllers: Array<new () => unknown>) =>
    findUnprotectedRoutes(controllers, new Reflector(), new MetadataScanner());

  it('accepts routes declared with @Public or @Roles (method or class level)', () => {
    expect(check(ProtectedController, ClassLevelController)).toEqual([]);
  });

  it('reports routes with no access declaration', () => {
    expect(check(ProtectedController, ForgottenController)).toEqual([
      'ForgottenController.forgotten',
    ]);
  });
});
