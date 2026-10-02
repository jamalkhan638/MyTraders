import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  bookerAreaSchema,
  bookerProductListSchema,
  bookerShopListSchema,
  bookerShopSchema,
  listBookerProductsQuerySchema,
  listBookerShopsQuerySchema,
  UserRole,
} from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { BookerService } from './booker.service';

class BookerShopDto extends createZodDto(bookerShopSchema) {}
class BookerShopListDto extends createZodDto(bookerShopListSchema) {}
class BookerAreaDto extends createZodDto(bookerAreaSchema) {}
class BookerProductListDto extends createZodDto(bookerProductListSchema) {}
class ListBookerShopsQueryDto extends createZodDto(listBookerShopsQuerySchema) {}
class ListBookerProductsQueryDto extends createZodDto(listBookerProductsQuerySchema) {}

/** Order Booker app data: own active shops, their areas, and active products without prices. */
@ApiTags('booker')
@ApiBearerAuth()
@Roles(UserRole.ORDER_BOOKER)
@Controller('booker')
export class BookerController {
  constructor(private readonly booker: BookerService) {}

  @Get('shops')
  @ApiOkResponse({
    type: BookerShopListDto,
    description: 'Active shops assigned to me, by area then name',
  })
  listShops(@Query() query: ListBookerShopsQueryDto) {
    return this.booker.listShops(query);
  }

  @Get('shops/:id')
  @ApiOkResponse({ type: BookerShopDto })
  @ApiNotFoundResponse({ description: 'Not one of my active assigned shops' })
  getShop(@Param('id', ParseUUIDPipe) id: string) {
    return this.booker.getShop(id);
  }

  @Get('areas')
  @ApiOkResponse({ type: [BookerAreaDto], description: 'Areas of my active assigned shops' })
  listAreas() {
    return this.booker.listAreas();
  }

  @Get('products')
  @ApiOkResponse({
    type: BookerProductListDto,
    description: 'Active products, without any price (D-24)',
  })
  listProducts(@Query() query: ListBookerProductsQueryDto) {
    return this.booker.listProducts(query);
  }
}
