import {
  authSessionResponseSchema,
  authUserSchema,
  loginRequestSchema,
  mobileRefreshRequestSchema,
  mobileSessionResponseSchema,
} from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';

export class LoginDto extends createZodDto(loginRequestSchema) {}
export class AuthSessionResponseDto extends createZodDto(authSessionResponseSchema) {}
export class AuthUserDto extends createZodDto(authUserSchema) {}
export class MobileSessionResponseDto extends createZodDto(mobileSessionResponseSchema) {}
export class MobileRefreshDto extends createZodDto(mobileRefreshRequestSchema) {}
