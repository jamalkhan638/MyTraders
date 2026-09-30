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
});
