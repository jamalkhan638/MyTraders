import {
  authSessionResponseSchema,
  authUserSchema,
  loginRequestSchema,
} from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';

export class LoginDto extends createZodDto(loginRequestSchema) {}
export class AuthSessionResponseDto extends createZodDto(authSessionResponseSchema) {}
export class AuthUserDto extends createZodDto(authUserSchema) {}
