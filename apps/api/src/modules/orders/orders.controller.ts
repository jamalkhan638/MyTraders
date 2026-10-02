import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  createOrderSchema,
  listOrdersQuerySchema,
  orderDetailsSchema,
  orderListSchema,
  UserRole,
} from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { OrdersService } from './orders.service';

class OrderDetailsDto extends createZodDto(orderDetailsSchema) {}
class OrderListDto extends createZodDto(orderListSchema) {}
class ListOrdersQueryDto extends createZodDto(listOrdersQuerySchema) {}
class CreateOrderDto extends createZodDto(createOrderSchema) {}

/**
 * Orders: products and quantities booked by Order Bookers (no prices, tax or payment — those are
 * decided on the invoice). Admins see all orders of the organization; bookers only their own.
 */
@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ORDER_BOOKER)
  @ApiOkResponse({
    type: OrderListDto,
    description:
      'Newest first. q matches order number or shop name. Bookers only ever get their own orders.',
  })
  list(@Query() query: ListOrdersQueryDto) {
    return this.orders.list(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ORDER_BOOKER)
  @ApiOkResponse({ type: OrderDetailsDto })
  @ApiNotFoundResponse({
    description: 'Not in your organization, or (for a booker) not your order',
  })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(id);
  }

  @Post()
  @Roles(UserRole.ORDER_BOOKER)
  @ApiCreatedResponse({
    type: OrderDetailsDto,
    description: 'Saved as PENDING with a server-generated number',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Shop not assigned to you / inactive, or a product unknown / inactive (details per field)',
  })
  create(@Body() body: CreateOrderDto) {
    return this.orders.create(body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.ORDER_BOOKER)
  @ApiOkResponse({ type: OrderDetailsDto })
  @ApiNotFoundResponse({
    description: 'Not in your organization, or (for a booker) not your order',
  })
  @ApiConflictResponse({ description: 'Only PENDING orders can be cancelled' })
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.cancel(id);
  }
}
