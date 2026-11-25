import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  HttpException,
  ConflictException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
} from 'typeorm';

import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';

import { Account } from '../accounts/entities/account.entity';
import { AccountType } from '../../common/enums/account-type.enum';
import { Payment } from './entities/payment.entity';
import { BillPaymentDto } from './dto/bill-payment.dto';
import { BillPaymentResponseDto } from './dto/bill-payment-response.dto';

interface PaymentAccounts {
  customer: Account;
  merchant: Account;
  bank: Account;
}

interface PostgresDriverError {
  code?: string;
  detail?: string;
  constraint?: string;
  table?: string;
  column?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  private readonly BILL_PAYMENT_CHARGE = new Decimal(30);

  private readonly MAX_PAYMENT_AMOUNT = new Decimal(
    '999999999999.99',
  );

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async payBill(
    dto: BillPaymentDto,
  ): Promise<BillPaymentResponseDto> {
    const reference = `PAY-${randomUUID()}`;

    this.logger.log(
      `[${reference}] Processing bill payment`,
    );

    try {
      const bankAccountNumber = this.getBankAccountNumber();

      this.validateAccountNumbers(
        dto,
        bankAccountNumber,
      );

      const amount = this.validateAmount(dto.amount);

      const charge = this.BILL_PAYMENT_CHARGE;
      const totalDebit = amount.plus(charge);

      const result = await this.dataSource.transaction(
        async (manager): Promise<BillPaymentResponseDto> => {
          this.logger.debug(
            `[${reference}] Database transaction started`,
          );

          // Retrieve and lock all accounts.
          const { customer, merchant, bank } =
            await this.getPaymentAccounts(
              manager,
              dto,
              bankAccountNumber,
            );

          this.validateAccountTypes(
            customer,
            merchant,
            bank,
          );

          const customerBalance = new Decimal(
            customer.balance,
          );

          this.validateAvailableBalance(
            customerBalance,
            totalDebit,
          );

          const balanceBefore = customerBalance.toFixed(2);

          // Debit customer by bill amount plus charge.
          customer.balance = customerBalance
            .minus(totalDebit)
            .toFixed(2);

          // Credit merchant with bill amount.
          merchant.balance = new Decimal(merchant.balance)
            .plus(amount)
            .toFixed(2);

          // Credit bank fee account with KES 30.
          bank.balance = new Decimal(bank.balance)
            .plus(charge)
            .toFixed(2);

          this.logger.debug(
            `[${reference}] Persisting account balance updates`,
          );

          // All balances are updated within the same transaction.
          await manager.save(Account, [
            customer,
            merchant,
            bank,
          ]);

          this.logger.debug(
            `[${reference}] Account balance updates persisted`,
          );

          // Create payment record.
          const payment = manager.create(Payment, {
            reference,
            customerAccountNumber: customer.accountNumber,
            merchantAccountNumber: merchant.accountNumber,
            amount: amount.toFixed(2),
            charge: charge.toFixed(2),
            totalDebit: totalDebit.toFixed(2),
            balanceBefore,
            balanceAfter: customer.balance,
            status: 'SUCCESS',
          });

          this.logger.debug(
            `[${reference}] Persisting payment record`,
          );

          const savedPayment = await manager.save(
            Payment,
            payment,
          );

          this.logger.debug(
            `[${reference}] Payment record persisted`,
          );

          return this.buildPaymentResponse(
            savedPayment,
            customer,
            merchant,
          );
        },
      );

      // This executes only after a successful database commit.
      this.logger.log(
        `[${reference}] Bill payment completed successfully`,
      );

      return result;
    } catch (error: unknown) {
      this.handlePaymentError(error, reference);
    }
  }

  /**
   * Retrieve and validate the configured bank fee account.
   */
  private getBankAccountNumber(): string {
    const accountNumber =
      this.configService.getOrThrow<string>(
        'BANK_FEE_ACCOUNT_NUMBER',
      );

    if (
      typeof accountNumber !== 'string' ||
      !/^\d{6,30}$/.test(accountNumber)
    ) {
      this.logger.error(
        'Invalid BANK_FEE_ACCOUNT_NUMBER configuration',
      );

      throw new InternalServerErrorException(
        'Bank fee account configuration is invalid',
      );
    }

    return accountNumber;
  }

  /**
   * Ensure all participating accounts are different.
   */
  private validateAccountNumbers(
    dto: BillPaymentDto,
    bankAccountNumber: string,
  ): void {
    const accountNumbers = [
      dto.customerAccountNumber,
      dto.merchantAccountNumber,
      bankAccountNumber,
    ];

    if (new Set(accountNumbers).size !== 3) {
      throw new BadRequestException(
        'Customer, merchant and bank accounts must be different',
      );
    }
  }

  /**
   * Validate payment amount before financial calculations.
   */
  private validateAmount(value: number): Decimal {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value)
    ) {
      throw new BadRequestException(
        'Invalid payment amount',
      );
    }

    const amount = new Decimal(value);

    if (
      amount.lte(0) ||
      amount.decimalPlaces() > 2 ||
      amount.gt(this.MAX_PAYMENT_AMOUNT)
    ) {
      throw new BadRequestException(
        'Invalid payment amount',
      );
    }

    return amount;
  }

  /**
   * Retrieve all participating accounts using pessimistic
   * write locks to prevent concurrent balance modifications.
   */
  private async getPaymentAccounts(
    manager: EntityManager,
    dto: BillPaymentDto,
    bankAccountNumber: string,
  ): Promise<PaymentAccounts> {
    const accountNumbers = [
      dto.customerAccountNumber,
      dto.merchantAccountNumber,
      bankAccountNumber,
    ].sort();

    const accounts = new Map<string, Account>();

    // Consistent lock ordering reduces the risk of deadlocks.
    for (const accountNumber of accountNumbers) {
      const account = await manager.findOne(Account, {
        where: {
          accountNumber,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!account) {
        if (accountNumber === bankAccountNumber) {
          throw new InternalServerErrorException(
            'Bank fee account is unavailable',
          );
        }

        if (
          accountNumber === dto.customerAccountNumber
        ) {
          throw new NotFoundException(
            'Customer account not found',
          );
        }

        throw new NotFoundException(
          'Merchant account not found',
        );
      }

      accounts.set(accountNumber, account);
    }

    return {
      customer: accounts.get(
        dto.customerAccountNumber,
      )!,
      merchant: accounts.get(
        dto.merchantAccountNumber,
      )!,
      bank: accounts.get(bankAccountNumber)!,
    };
  }

  /**
   * Validate the role of each participating account.
   */
  private validateAccountTypes(
    customer: Account,
    merchant: Account,
    bank: Account,
  ): void {
    if (customer.accountType !== AccountType.CUSTOMER) {
      throw new BadRequestException(
        'Source account must be a customer account',
      );
    }

    if (merchant.accountType !== AccountType.MERCHANT) {
      throw new BadRequestException(
        'Destination account must be a merchant account',
      );
    }

    if (bank.accountType !== AccountType.BANK) {
      throw new InternalServerErrorException(
        'Invalid bank fee account',
      );
    }
  }

  /**
   * Ensure the customer can afford both the bill and charge.
   */
  private validateAvailableBalance(
    availableBalance: Decimal,
    totalDebit: Decimal,
  ): void {
    if (availableBalance.lt(totalDebit)) {
      throw new BadRequestException(
        'Insufficient funds to cover bill amount and transaction charge',
      );
    }
  }

  /**
   * Build a consistent and user-friendly payment response.
   */
  private buildPaymentResponse(
    payment: Payment,
    customer: Account,
    merchant: Account,
  ): BillPaymentResponseDto {
    return {
      success: true,
      message: 'Bill payment successful',
      data: {
        reference: payment.reference,
        customerAccountNumber: customer.accountNumber,
        merchantAccountNumber: merchant.accountNumber,
        merchantName: merchant.name,
        currency: 'KES',
        billAmount: payment.amount,
        transactionCharge: payment.charge,
        totalDebit: payment.totalDebit,
        availableBalance: customer.balance,
        status: payment.status,
        transactionDate: payment.createdAt,
      },
    };
  }

  /**
   * Handle application and PostgreSQL exceptions.
   *
   * Internal database details are logged but are not
   * exposed to the API consumer.
   */
  private handlePaymentError(
    error: unknown,
    reference: string,
  ): never {
    // Preserve existing NestJS HTTP exceptions.
    if (error instanceof HttpException) {
      const status = error.getStatus();

      if (status >= 500) {
        this.logger.error(
          `[${reference}] Payment failed: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.warn(
          `[${reference}] Payment rejected: ` +
            `status=${status}, message=${error.message}`,
        );
      }

      throw error;
    }

    // Handle PostgreSQL query failures.
    if (error instanceof QueryFailedError) {
      const driverError =
        error.driverError as PostgresDriverError;

      this.logger.error(
        `[${reference}] PostgreSQL query failed: ` +
          `code=${driverError.code ?? 'UNKNOWN'}, ` +
          `table=${driverError.table ?? 'UNKNOWN'}, ` +
          `column=${driverError.column ?? 'UNKNOWN'}, ` +
          `constraint=${driverError.constraint ?? 'NONE'}`,
      );

      // Detailed diagnostics only in local development.
      if (process.env.NODE_ENV === 'development') {
        this.logger.error(
          `[${reference}] Database error: ${error.message}`,
          error.stack,
        );

        if (driverError.detail) {
          this.logger.debug(
            `[${reference}] Detail: ${driverError.detail}`,
          );
        }
      }

      switch (driverError.code) {
        case '23505':
          throw new ConflictException(
            'Payment conflicts with an existing record',
          );

        case '23503':
          this.logger.error(
            `[${reference}] Foreign key constraint violation`,
          );
          break;

        case '23514':
          this.logger.error(
            `[${reference}] Check constraint violation`,
          );
          break;

        case '23502':
          this.logger.error(
            `[${reference}] Required database column is null`,
          );
          break;

        case '22003':
          this.logger.error(
            `[${reference}] Numeric value out of range`,
          );
          break;

        case '22001':
          this.logger.error(
            `[${reference}] Value exceeds column length`,
          );
          break;

        case '42703':
          this.logger.error(
            `[${reference}] Database column does not exist`,
          );
          break;

        case '42P01':
          this.logger.error(
            `[${reference}] Database table does not exist`,
          );
          break;

        case '40P01':
          this.logger.error(
            `[${reference}] Database deadlock detected`,
          );
          break;

        case '40001':
          this.logger.error(
            `[${reference}] Transaction serialization failure`,
          );
          break;

        default:
          this.logger.error(
            `[${reference}] Unhandled PostgreSQL error`,
          );
      }

      throw new InternalServerErrorException(
        'Unable to process bill payment',
      );
    }

    // Handle unexpected application errors.
    if (error instanceof Error) {
      this.logger.error(
        `[${reference}] Unexpected error: ${error.name}`,
      );

      if (process.env.NODE_ENV === 'development') {
        this.logger.error(
          `[${reference}] ${error.message}`,
          error.stack,
        );
      }
    } else {
      this.logger.error(
        `[${reference}] Unknown payment processing error`,
      );
    }

    throw new InternalServerErrorException(
      'Unable to process bill payment',
    );
  }
}