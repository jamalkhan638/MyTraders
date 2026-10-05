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
  expenseCategoryListSchema,
  expenseCategorySchema,
  createExpenseCategorySchema,
  listExpenseCategoriesQuerySchema,
  updateExpenseCategorySchema,
  UserRole,
} from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { ExpenseCategoriesService } from './expense-categories.service';

class ExpenseCategoryDto extends createZodDto(expenseCategorySchema) {}
class ExpenseCategoryListDto extends createZodDto(expenseCategoryListSchema) {}
class ListExpenseCategoriesQueryDto extends createZodDto(listExpenseCategoriesQuerySchema) {}
class CreateExpenseCategoryDto extends createZodDto(createExpenseCategorySchema) {}
class UpdateExpenseCategoryDto extends createZodDto(updateExpenseCategorySchema) {}

/** Expense category management — Admin only. Categories are never deleted, only deactivated. */
@ApiTags('expense-categories')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly categories: ExpenseCategoriesService) {}

  @Get()
  @ApiOkResponse({
    type: ExpenseCategoryListDto,
    description: 'Expense categories of the current organization, sorted by name',
  })
  list(@Query() query: ListExpenseCategoriesQueryDto) {
    return this.categories.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ExpenseCategoryDto })
  @ApiNotFoundResponse({ description: 'Not found in the current organization' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.get(id);
  }

  @Post()
  @ApiCreatedResponse({ type: ExpenseCategoryDto })
  @ApiConflictResponse({
    description: 'An expense category with this name already exists in the organization',
  })
  create(@Body() body: CreateExpenseCategoryDto) {
    return this.categories.create(body);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ExpenseCategoryDto, description: 'Rename and/or activate/deactivate' })
  @ApiNotFoundResponse({ description: 'Not found in the current organization' })
  @ApiConflictResponse({
    description: 'An expense category with this name already exists in the organization',
  })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateExpenseCategoryDto) {
    return this.categories.update(id, body);
  }
}
