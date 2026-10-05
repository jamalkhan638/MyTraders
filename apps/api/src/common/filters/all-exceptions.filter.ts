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
    // Business-rule errors may carry field-level details, e.g. { path: 'areaId', message }.
    const details =
      response && typeof response === 'object' && 'details' in response
        ? (response as { details: ApiErrorBody['details'] }).details
        : undefined;
    return details ? { ...base(status), message, details } : { ...base(status), message };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002':
        return { ...base(409), message: 'A record with the same value already exists' };
      case 'P2025':
        return { ...base(404), message: 'Record not found' };
      case 'P2003':
        return { ...base(409), message: 'The record is referenced by or references other data' };
      case 'P2000':
      case 'P2020':
        // a value does not fit its column — inputs are validated, so this is a safety net
        return { ...base(422), message: 'A value is too large' };
    }
  }

  // Request body errors raised by the body parser before Nest (e.g. 413 body too large).
  const status = clientErrorStatus(exception);
  if (status) {
    return {
      ...base(status),
      message: status === 413 ? 'The request is too large' : 'The request body is not valid',
    };
  }

  return { ...base(500), message: 'Internal server error' };
}

/** 4xx status of an http-errors error (body-parser), if the exception is one. */
function clientErrorStatus(exception: unknown): number | undefined {
  if (!exception || typeof exception !== 'object') return undefined;
  const { status, expose } = exception as { status?: unknown; expose?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && expose === true
    ? status
    : undefined;
}

function base(statusCode: number): Pick<ApiErrorBody, 'statusCode' | 'error'> {
  return { statusCode, error: STATUS_CODES[statusCode] ?? 'Error' };
}
