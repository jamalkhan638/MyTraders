import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import '../types/auth-context';
import { type AuthContext } from '../types/auth-context';

/** Injects the authenticated user's context into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const auth = ctx.switchToHttp().getRequest<Request>().auth;
    if (!auth) throw new UnauthorizedException('Not authenticated');
    return auth;
  },
);
