import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators/access.decorators';

type Handler = (...args: unknown[]) => unknown;

/** Lists `Controller.method` routes that declare neither @Public nor @Roles. */
export function findUnprotectedRoutes(
  controllers: Array<new (...args: never[]) => unknown>,
  reflector: Reflector,
  scanner: MetadataScanner,
): string[] {
  const unprotected: string[] = [];
  for (const controller of controllers) {
    const prototype = controller.prototype as Record<string, Handler>;
    for (const methodName of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[methodName];
      if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue; // not a route
      const targets = [handler, controller];
      const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
      const roles = reflector.getAllAndOverride<unknown[]>(ROLES_KEY, targets);
      if (!isPublic && !(roles && roles.length > 0)) {
        unprotected.push(`${controller.name}.${methodName}`);
      }
    }
  }
  return unprotected;
}

/** Fails application startup if any route forgot its access declaration. */
@Injectable()
export class RouteAccessCheck implements OnApplicationBootstrap {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
    private readonly scanner: MetadataScanner,
  ) {}

  onApplicationBootstrap(): void {
    const controllers = this.discovery
      .getControllers()
      .map((wrapper) => wrapper.metatype as new (...args: never[]) => unknown)
      .filter(Boolean);
    const unprotected = findUnprotectedRoutes(controllers, this.reflector, this.scanner);
    if (unprotected.length > 0) {
      throw new Error(`Routes without @Public or @Roles: ${unprotected.join(', ')}`);
    }
  }
}
