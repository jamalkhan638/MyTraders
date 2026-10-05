import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { toErrorBody } from './all-exceptions.filter';

describe('toErrorBody', () => {
  it('passes field-level details of business-rule errors through', () => {
    const body = toErrorBody(
      new UnprocessableEntityException({
        message: 'Area not found',
        details: [{ path: 'areaId', message: 'Area not found' }],
      }),
    );
    expect(body).toEqual({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: 'Area not found',
      details: [{ path: 'areaId', message: 'Area not found' }],
    });
  });

  it('keeps plain HTTP errors without details', () => {
    expect(toErrorBody(new NotFoundException('Shop not found'))).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Shop not found',
    });
  });

  it('hides internal errors', () => {
    expect(toErrorBody(new Error('database password is xyz'))).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
  });

  it('keeps the 4xx status of body-parser errors (413 too large, 400 invalid JSON)', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
    });
    expect(toErrorBody(tooLarge)).toEqual({
      statusCode: 413,
      error: 'Payload Too Large',
      message: 'The request is too large',
    });
    // a non-exposed status (internal) stays a 500
    const internal = Object.assign(new Error('x'), { status: 400, expose: false });
    expect(toErrorBody(internal).statusCode).toBe(500);
  });
});
