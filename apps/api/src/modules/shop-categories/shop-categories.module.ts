import { Module } from '@nestjs/common';
import { ShopCategoriesController } from './shop-categories.controller';
import { ShopCategoriesService } from './shop-categories.service';

@Module({
  controllers: [ShopCategoriesController],
  providers: [ShopCategoriesService],
})
export class ShopCategoriesModule {}
