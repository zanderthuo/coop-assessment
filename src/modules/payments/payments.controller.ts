import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';

import { PaymentsService } from './payments.service';
import { BillPaymentDto } from './dto/bill-payment.dto';
import { BillPaymentResponseDto } from './dto/bill-payment-response.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post('bill')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Process a bill payment',
    description: `
      Processes a bill payment from a customer account to a merchant account.

      Business rules:
      - Customer and merchant accounts must exist.
      - Payment amount must be greater than zero.
      - A flat transaction charge of KES 30 applies.
      - Customer must have sufficient funds.
      - Customer is debited by the bill amount plus the charge.
      - Merchant is credited with the bill amount.
      - Bank fee account is credited with the charge.
      - All balance updates are performed in an atomic database transaction.
      - A unique payment reference is generated.
    `,
  })
  @ApiBody({
    type: BillPaymentDto,
    examples: {
      successfulPayment: {
        summary: 'Successful bill payment',
        value: {
          customerAccountNumber: '1000000001',
          merchantAccountNumber: '2000000001',
          amount: 1000,
        },
      },
      decimalPayment: {
        summary: 'Payment with decimal amount',
        value: {
          customerAccountNumber: '1000000001',
          merchantAccountNumber: '2000000001',
          amount: 250.75,
        },
      },
      insufficientFunds: {
        summary: 'Insufficient funds (balance of KES 5,000)',
        value: {
          customerAccountNumber: '1000000001',
          merchantAccountNumber: '2000000001',
          amount: 5000,
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Bill payment processed successfully',
    type: BillPaymentResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid request or insufficient funds',
    schema: {
      example: {
        success: false,
        statusCode: 400,
        message:
          'Insufficient funds to cover bill amount and transaction charge',
        timestamp: '2026-11-25T09:10:00.000Z',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Customer or merchant account not found',
    schema: {
      example: {
        success: false,
        statusCode: 404,
        message: 'Customer account not found',
        timestamp: '2026-11-25T09:10:00.000Z',
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Payment processing failed',
    schema: {
      example: {
        success: false,
        statusCode: 500,
        message: 'Unable to process bill payment',
        timestamp: '2026-11-25T09:10:00.000Z',
      },
    },
  })
  async payBill(
    @Body() dto: BillPaymentDto,
  ): Promise<BillPaymentResponseDto> {
    return this.paymentsService.payBill(dto);
  }
}