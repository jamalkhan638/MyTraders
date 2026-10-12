import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
  cancelInvoiceSchema,
  createInvoiceSchema,
  editInvoiceSchema,
  invoiceBatchQuerySchema,
  invoiceDetailsSchema,
  invoiceDraftQuerySchema,
  invoiceDraftSchema,
  invoiceListSchema,
  invoicePreviewSchema,
  listInvoicesQuerySchema,
  UserRole,
} from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { InvoicesService } from './invoices.service';

class InvoiceDetailsDto extends createZodDto(invoiceDetailsSchema) {}
class InvoiceListDto extends createZodDto(invoiceListSchema) {}
class InvoiceDraftDto extends createZodDto(invoiceDraftSchema) {}
class InvoicePreviewDto extends createZodDto(invoicePreviewSchema) {}
class ListInvoicesQueryDto extends createZodDto(listInvoicesQuerySchema) {}
class InvoiceDraftQueryDto extends createZodDto(invoiceDraftQuerySchema) {}
class CreateInvoiceDto extends createZodDto(createInvoiceSchema) {}
class CancelInvoiceDto extends createZodDto(cancelInvoiceSchema) {}
class EditInvoiceDto extends createZodDto(editInvoiceSchema) {}
class InvoiceBatchQueryDto extends createZodDto(invoiceBatchQuerySchema) {}

/**
 * Invoices — Admin only (docs/permissions.md). One creation endpoint for direct and order-based
 * invoices; the server computes every value and ignores totals sent by a client.
 */
@ApiTags('invoices')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @ApiOkResponse({
    type: InvoiceListDto,
    description: 'Newest invoice date first. q matches invoice number or shop name.',
  })
  list(@Query() query: ListInvoicesQueryDto) {
    return this.invoices.list(query);
  }

  @Get('draft')
  @ApiOkResponse({
    type: InvoiceDraftDto,
    description: 'Opening state of the invoice form: ?shopId= (direct) or ?orderId= (from order)',
  })
  @ApiNotFoundResponse({ description: 'Shop / order not in your organization' })
  @ApiConflictResponse({ description: 'The order is not PENDING' })
  draft(@Query() query: InvoiceDraftQueryDto) {
    return this.invoices.draft(query);
  }

  @Get('batch')
  @ApiOkResponse({
    type: [InvoiceDetailsDto],
    description: 'Bulk print: ?ids=a,b,c (max 100), returned in that order',
  })
  @ApiNotFoundResponse({ description: 'An invoice is not in your organization' })
  batch(@Query() query: InvoiceBatchQueryDto) {
    return this.invoices.batch(query.ids);
  }

  @Post('preview')
  @HttpCode(200)
  @ApiOkResponse({ type: InvoicePreviewDto, description: 'Computes all values; saves nothing' })
  @ApiUnprocessableEntityResponse({ description: 'Product unknown / inactive or row invalid' })
  preview(@Body() body: CreateInvoiceDto) {
    return this.invoices.preview(body);
  }

  @Post()
  @ApiCreatedResponse({
    type: InvoiceDetailsDto,
    description: 'Confirmed in one transaction with a server-generated number',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Shop / order / product invalid for this invoice (details per field)',
  })
  @ApiConflictResponse({ description: 'The order is not PENDING (e.g. already invoiced)' })
  create(@Body() body: CreateInvoiceDto) {
    return this.invoices.create(body);
  }

  @Get(':id')
  @ApiOkResponse({ type: InvoiceDetailsDto })
  @ApiNotFoundResponse({ description: 'Not in your organization' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.get(id);
  }

  @Get(':id/edit-draft')
  @ApiOkResponse({
    type: InvoiceDraftDto,
    description: 'The invoice form prefilled with the saved invoice, to edit it (D-41)',
  })
  @ApiNotFoundResponse({ description: 'Not in your organization' })
  @ApiConflictResponse({ description: 'Cancelled invoices cannot be edited' })
  editDraft(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.editDraft(id);
  }

  @Put(':id')
  @ApiOkResponse({
    type: InvoiceDetailsDto,
    description:
      'Edits a confirmed invoice: same number, recalculated values, revision with reason, ' +
      'ledger reversal + new debit (D-41)',
  })
  @ApiNotFoundResponse({ description: 'Not in your organization' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid values, or nothing changed' })
  @ApiConflictResponse({
    description: "Cancelled invoice, or the shop's balance would become negative",
  })
  edit(@Param('id', ParseUUIDPipe) id: string, @Body() body: EditInvoiceDto) {
    return this.invoices.edit(id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOkResponse({ type: InvoiceDetailsDto })
  @ApiNotFoundResponse({ description: 'Not in your organization' })
  @ApiConflictResponse({ description: 'Already cancelled' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: CancelInvoiceDto) {
    return this.invoices.cancel(id, body.reason);
  }
}
