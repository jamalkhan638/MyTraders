import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  adjustCreditSchema,
  areaLedgerQuerySchema,
  areaLedgerSchema,
  ledgerPostingSchema,
  marketCreditSchema,
  recordPaymentSchema,
  shopLedgerQuerySchema,
  shopLedgerSchema,
  UserRole,
} from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { ShopLedgerService } from './shop-ledger.service';

class ShopLedgerDto extends createZodDto(shopLedgerSchema) {}
class ShopLedgerQueryDto extends createZodDto(shopLedgerQuerySchema) {}
class LedgerPostingDto extends createZodDto(ledgerPostingSchema) {}
class RecordPaymentDto extends createZodDto(recordPaymentSchema) {}
class AdjustCreditDto extends createZodDto(adjustCreditSchema) {}
class AreaLedgerDto extends createZodDto(areaLedgerSchema) {}
class AreaLedgerQueryDto extends createZodDto(areaLedgerQuerySchema) {}
class MarketCreditDto extends createZodDto(marketCreditSchema) {}

/**
 * A shop's credit: ledger history, payments and adjustments — Admin only (D-24: bookers never see
 * credit). Every change is a new ledger entry; nothing overwrites a balance.
 */
@ApiTags('ledger')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('shops/:shopId')
export class ShopLedgerController {
  constructor(private readonly ledger: ShopLedgerService) {}

  @Get('ledger')
  @ApiOkResponse({
    type: ShopLedgerDto,
    description: 'Current balance and history (newest first) with running balances',
  })
  @ApiNotFoundResponse({ description: 'Shop not in your organization' })
  history(@Param('shopId', ParseUUIDPipe) shopId: string, @Query() query: ShopLedgerQueryDto) {
    return this.ledger.history(shopId, query.page, query.pageSize);
  }

  @Post('payments')
  @ApiCreatedResponse({ type: LedgerPostingDto, description: 'Payment + PAYMENT credit entry' })
  @ApiNotFoundResponse({ description: 'Shop not in your organization' })
  @ApiUnprocessableEntityResponse({
    description: 'More than the outstanding balance, or future date',
  })
  recordPayment(@Param('shopId', ParseUUIDPipe) shopId: string, @Body() body: RecordPaymentDto) {
    return this.ledger.recordPayment(shopId, body);
  }

  @Post('adjustments')
  @ApiCreatedResponse({ type: LedgerPostingDto, description: 'MANUAL_ADJUSTMENT entry' })
  @ApiNotFoundResponse({ description: 'Shop not in your organization' })
  @ApiUnprocessableEntityResponse({ description: 'Decrease below zero, or future date' })
  adjust(@Param('shopId', ParseUUIDPipe) shopId: string, @Body() body: AdjustCreditDto) {
    return this.ledger.adjust(shopId, body);
  }
}

/** Organization-wide views over the shop ledger (no balances are stored outside it). */
@ApiTags('ledger')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledger: ShopLedgerService) {}

  @Get('areas/:areaId')
  @ApiOkResponse({
    type: AreaLedgerDto,
    description: 'Area collection sheet for a date: opening, payments, closing per shop + totals',
  })
  @ApiNotFoundResponse({ description: 'Area not in your organization' })
  areaLedger(@Param('areaId', ParseUUIDPipe) areaId: string, @Query() query: AreaLedgerQueryDto) {
    return this.ledger.areaLedger(areaId, query);
  }

  @Get('market-credit')
  @ApiOkResponse({ type: MarketCreditDto, description: 'Σ outstanding balance of all shops' })
  marketCredit() {
    return this.ledger.marketCredit();
  }
}
