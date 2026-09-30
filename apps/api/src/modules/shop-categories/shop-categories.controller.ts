import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  shopCategoryListSchema,
  shopCategorySchema,
  createShopCategorySchema,
  listShopCategoriesQuerySchema,
  updateShopCategorySchema,
  UserRole,
} from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { ShopCategoriesService } from './shop-categories.service';

class ShopCategoryDto extends createZodDto(shopCategorySchema) {}
class ShopCategoryListDto extends createZodDto(shopCategoryListSchema) {}
class ListShopCategoriesQueryDto extends createZodDto(listShopCategoriesQuerySchema) {}
class CreateShopCategoryDto extends createZodDto(createShopCategorySchema) {}
class UpdateShopCategoryDto extends createZodDto(updateShopCategorySchema) {}

/** Shop category management — Admin only. Categories are never deleted, only deactivated. */
@ApiTags('shop-categories')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('shop-categories')
export class ShopCategoriesController {
  constructor(private readonly categories: ShopCategoriesService) {}

  @Get()
  @ApiOkResponse({
    type: ShopCategoryListDto,
    description: 'Shop categories of the current organization, sorted by name',
  })
  list(@Query() query: ListShopCategoriesQueryDto) {
    return this.categories.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ShopCategoryDto })
  @ApiNotFoundResponse({ description: 'Not found in the current organization' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.get(id);
  }

  @Post()
  @ApiCreatedResponse({ type: ShopCategoryDto })
  @ApiConflictResponse({
    description: 'A shop category with this name already exists in the organization',
  })
  create(@Body() body: CreateShopCategoryDto) {
    return this.categories.create(body);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ShopCategoryDto, description: 'Rename and/or activate/deactivate' })
  @ApiNotFoundResponse({ description: 'Not found in the current organization' })
  @ApiConflictResponse({
    description: 'A shop category with this name already exists in the organization',
  })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateShopCategoryDto) {
    return this.categories.update(id, body);
  }
}
