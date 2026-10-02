import { Module } from '@nestjs/common';
import { BookerController } from './booker.controller';
import { BookerService } from './booker.service';

@Module({
  controllers: [BookerController],
  providers: [BookerService],
})
export class BookerModule {}
