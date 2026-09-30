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
  createProductSchema,
  listProductsQuerySchema,
  productListSchema,
  productSchema,
  updateProductSchema,
  UserRole,
} from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { ProductsService } from './products.service';

class ProductDto extends createZodDto(productSchema) {}
class ProductListDto extends createZodDto(productListSchema) {}
class ListProductsQueryDto extends createZodDto(listProductsQuerySchema) {}
class CreateProductDto extends createZodDto(createProductSchema) {}
class UpdateProductDto extends createZodDto(updateProductSchema) {}

/**
 * Product management — Admin only (the Order Booker product list without cost price comes
 * with Book Order in Phase 3). Products are never deleted, only deactivated.
 * Money values are decimal strings, e.g. "2180.50".
 */
@ApiTags('products')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOkResponse({
    type: ProductListDto,
    description: 'Products sorted by name; q matches name or code',
  })
  list(@Query() query: ListProductsQueryDto) {
    return this.products.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductDto })
  @ApiNotFoundResponse({ description: 'Not found in the current organization' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(id);
  }

  @Post()
  @ApiCreatedResponse({ type: ProductDto })
  @ApiConflictResponse({
    description: 'A product with this code already exists in the organization',
  })
  create(@Body() body: CreateProductDto) {
    return this.products.create(body);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ProductDto, description: 'Edit any fields and/or activate/deactivate' })
  @ApiNotFoundResponse({ description: 'Not found in the current organization' })
  @ApiConflictResponse({
    description: 'A product with this code already exists in the organization',
  })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateProductDto) {
    return this.products.update(id, body);
  }
}
