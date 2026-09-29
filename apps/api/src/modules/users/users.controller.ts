import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  createOrderBookerSchema,
  listUsersQuerySchema,
  updateOrderBookerSchema,
  userListSchema,
  UserRole,
  userSchema,
} from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { UsersService } from './users.service';

class UserDto extends createZodDto(userSchema) {}
class UserListDto extends createZodDto(userListSchema) {}
class ListUsersQueryDto extends createZodDto(listUsersQuerySchema) {}
class CreateOrderBookerDto extends createZodDto(createOrderBookerSchema) {}
class UpdateOrderBookerDto extends createZodDto(updateOrderBookerSchema) {}

@ApiTags('users')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOkResponse({ type: UserListDto })
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: UserDto })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  /** Creates an Order Booker in the Admin's organization. Role and organization are not client input. */
  @Post()
  @ApiCreatedResponse({ type: UserDto })
  create(@Body() body: CreateOrderBookerDto) {
    return this.users.createOrderBooker(body);
  }

  /** Edits an Order Booker (name, email, phone, active flag, password reset). */
  @Patch(':id')
  @ApiOkResponse({ type: UserDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateOrderBookerDto) {
    return this.users.updateOrderBooker(id, body);
  }
}
