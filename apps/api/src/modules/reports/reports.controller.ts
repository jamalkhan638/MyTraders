import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  expenseReportQuerySchema,
  expenseReportSchema,
  invoiceReportQuerySchema,
  invoiceReportSchema,
  productSalesReportQuerySchema,
  productSalesReportSchema,
  profitReportQuerySchema,
  profitReportSchema,
  salesReportQuerySchema,
  salesReportSchema,
  shopCreditReportQuerySchema,
  shopCreditReportSchema,
  shopListReportQuerySchema,
  shopListReportSchema,
  UserRole,
} from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { ReportsService } from './reports.service';

class SalesReportQueryDto extends createZodDto(salesReportQuerySchema) {}
class SalesReportDto extends createZodDto(salesReportSchema) {}
class InvoiceReportQueryDto extends createZodDto(invoiceReportQuerySchema) {}
class InvoiceReportDto extends createZodDto(invoiceReportSchema) {}
class ShopCreditReportQueryDto extends createZodDto(shopCreditReportQuerySchema) {}
class ShopCreditReportDto extends createZodDto(shopCreditReportSchema) {}
class ProductSalesReportQueryDto extends createZodDto(productSalesReportQuerySchema) {}
class ProductSalesReportDto extends createZodDto(productSalesReportSchema) {}
class ExpenseReportQueryDto extends createZodDto(expenseReportQuerySchema) {}
class ExpenseReportDto extends createZodDto(expenseReportSchema) {}
class ProfitReportQueryDto extends createZodDto(profitReportQuerySchema) {}
class ProfitReportDto extends createZodDto(profitReportSchema) {}
class ShopListReportQueryDto extends createZodDto(shopListReportQuerySchema) {}
class ShopListReportDto extends createZodDto(shopListReportSchema) {}

const PERIOD = 'Dates default to the current month (organization timezone)';

/** Reports — Admin only (docs/permissions.md). Thin: every figure comes from the domain services. */
@ApiTags('reports')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  @ApiOkResponse({
    type: SalesReportDto,
    description: `Confirmed invoices' Payable Value. ${PERIOD}`,
  })
  sales(@Query() query: SalesReportQueryDto) {
    return this.reports.sales(query);
  }

  @Get('invoices')
  @ApiOkResponse({ type: InvoiceReportDto, description: `Totals count confirmed only. ${PERIOD}` })
  invoices(@Query() query: InvoiceReportQueryDto) {
    return this.reports.invoices(query);
  }

  @Get('shop-credit')
  @ApiOkResponse({ type: ShopCreditReportDto, description: 'Outstanding Shop Ledger balances' })
  shopCredit(@Query() query: ShopCreditReportQueryDto) {
    return this.reports.shopCredit(query);
  }

  @Get('product-sales')
  @ApiOkResponse({
    type: ProductSalesReportDto,
    description: `From invoice item snapshots. ${PERIOD}`,
  })
  productSales(@Query() query: ProductSalesReportQueryDto) {
    return this.reports.productSales(query);
  }

  @Get('expenses')
  @ApiOkResponse({
    type: ExpenseReportDto,
    description: `Voided expenses never in the total. ${PERIOD}`,
  })
  expenses(@Query() query: ExpenseReportQueryDto) {
    return this.reports.expenseReport(query);
  }

  @Get('profit')
  @ApiOkResponse({
    type: ProfitReportDto,
    description: `/profit/summary, also per month. ${PERIOD}`,
  })
  profit(@Query() query: ProfitReportQueryDto) {
    return this.reports.profitReport(query);
  }

  @Get('shops')
  @ApiOkResponse({ type: ShopListReportDto, description: 'Shop list with current outstanding' })
  shops(@Query() query: ShopListReportQueryDto) {
    return this.reports.shopList(query);
  }
}
