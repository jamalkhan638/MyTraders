import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
  createExpenseSchema,
  expenseListSchema,
  expenseSchema,
  expenseSummaryQuerySchema,
  expenseSummarySchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
  UserRole,
  voidExpenseSchema,
} from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { ExpensesService } from './expenses.service';

class ExpenseDto extends createZodDto(expenseSchema) {}
class ExpenseListDto extends createZodDto(expenseListSchema) {}
class ListExpensesQueryDto extends createZodDto(listExpensesQuerySchema) {}
class CreateExpenseDto extends createZodDto(createExpenseSchema) {}
class UpdateExpenseDto extends createZodDto(updateExpenseSchema) {}
class VoidExpenseDto extends createZodDto(voidExpenseSchema) {}
class ExpenseSummaryDto extends createZodDto(expenseSummarySchema) {}
class ExpenseSummaryQueryDto extends createZodDto(expenseSummaryQuerySchema) {}

/** Expenses — Admin only (D-32). Never deleted: voided with a reason. */
@ApiTags('expenses')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @ApiOkResponse({
    type: ExpenseListDto,
    description: 'Newest first; totalAmount = Σ of all expenses matching the filters',
  })
  list(@Query() query: ListExpensesQueryDto) {
    return this.expenses.list(query);
  }

  @Get('summary')
  @ApiOkResponse({
    type: ExpenseSummaryDto,
    description: 'Σ active expenses in [from, to] by category; default = current month',
  })
  summary(@Query() query: ExpenseSummaryQueryDto) {
    return this.expenses.summary(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ExpenseDto })
  @ApiNotFoundResponse({ description: 'Not in your organization' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenses.get(id);
  }

  @Post()
  @ApiCreatedResponse({ type: ExpenseDto })
  @ApiUnprocessableEntityResponse({ description: 'Category unknown / inactive, or future date' })
  create(@Body() body: CreateExpenseDto) {
    return this.expenses.create(body);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ExpenseDto })
  @ApiNotFoundResponse({ description: 'Not in your organization' })
  @ApiConflictResponse({ description: 'The expense is voided' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateExpenseDto) {
    return this.expenses.update(id, body);
  }

  @Post(':id/void')
  @HttpCode(200)
  @ApiOkResponse({ type: ExpenseDto, description: 'Kept for history, excluded from totals' })
  @ApiNotFoundResponse({ description: 'Not in your organization' })
  @ApiConflictResponse({ description: 'Already voided' })
  void(@Param('id', ParseUUIDPipe) id: string, @Body() body: VoidExpenseDto) {
    return this.expenses.void(id, body.reason);
  }
}
