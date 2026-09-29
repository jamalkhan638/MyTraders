import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { type ApiErrorBody } from '@mytraders/shared-types';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { ZodValidationException } from 'nestjs-zod';
import { type ZodError } from 'zod';

/** Formats every error as { statusCode, error, message, details? } (docs/architecture.md §9). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = toErrorBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    response.status(body.statusCode).json(body);
  }
}

export function toErrorBody(exception: unknown): ApiErrorBody {
  if (exception instanceof ZodValidationException) {
    const zodError = exception.getZodError() as ZodError;
    return {
      ...base(400),
      message: 'Validation failed',
      details: zodError.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    let message = exception.message;
    if (typeof response === 'string') {
      message = response;
    } else if (response && typeof response === 'object' && 'message' in response) {
      const raw = (response as { message: unknown }).message;
      message = Array.isArray(raw) ? raw.join(', ') : String(raw);
    }
    return { ...base(status), message };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002':
        return { ...base(409), message: 'A record with the same value already exists' };
      case 'P2025':
        return { ...base(404), message: 'Record not found' };
      case 'P2003':
        return { ...base(409), message: 'The record is referenced by or references other data' };
    }
  }

  return { ...base(500), message: 'Internal server error' };
}

function base(statusCode: number): Pick<ApiErrorBody, 'statusCode' | 'error'> {
  return { statusCode, error: STATUS_CODES[statusCode] ?? 'Error' };
}
