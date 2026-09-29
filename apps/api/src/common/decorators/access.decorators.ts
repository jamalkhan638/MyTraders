import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@mytraders/shared-types';

export const IS_PUBLIC_KEY = 'access:isPublic';
export const ROLES_KEY = 'access:roles';

/** Route needs no access token (login, refresh, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Roles allowed to call the route. Every non-public route must declare this (default deny). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Any authenticated user, whatever the role. */
export const AnyRole = () => Roles(...Object.values(UserRole));
