import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  createShopSchema,
  listShopsQuerySchema,
  shopListSchema,
  shopSchema,
  updateShopSchema,
  UserRole,
} from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { ShopsService } from './shops.service';

class ShopDto extends createZodDto(shopSchema) {}
class ShopListDto extends createZodDto(shopListSchema) {}
class ListShopsQueryDto extends createZodDto(listShopsQuerySchema) {}
class CreateShopDto extends createZodDto(createShopSchema) {}
class UpdateShopDto extends createZodDto(updateShopSchema) {}

const INVALID_REFERENCE =
  'Area, shop category or order booker is not an active record of your organization (details per field)';

/**
 * Shop management — Admin only. The Order Booker "My Shops" list (assigned shops only)
 * comes in Phase 3. Shops are never deleted, only deactivated. No credit is stored on shops.
 */
@ApiTags('shops')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('shops')
export class ShopsController {
  constructor(private readonly shops: ShopsService) {}

  @Get()
  @ApiOkResponse({
    type: ShopListDto,
    description:
      'Sorted by name. q matches name, contact person or phone; orderBookerId=unassigned for no booker',
  })
  list(@Query() query: ListShopsQueryDto) {
    return this.shops.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ShopDto })
  @ApiNotFoundResponse({ description: 'Not found in the current organization' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.shops.get(id);
  }

  @Post()
  @ApiCreatedResponse({ type: ShopDto })
  @ApiUnprocessableEntityResponse({ description: INVALID_REFERENCE })
  create(@Body() body: CreateShopDto) {
    return this.shops.create(body);
  }

  @Patch(':id')
  @ApiOkResponse({
    type: ShopDto,
    description: 'Edit, reassign (null removes category/booker), activate/deactivate',
  })
  @ApiNotFoundResponse({ description: 'Not found in the current organization' })
  @ApiUnprocessableEntityResponse({ description: INVALID_REFERENCE })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateShopDto) {
    return this.shops.update(id, body);
  }
}
