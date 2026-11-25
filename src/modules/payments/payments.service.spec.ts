import {
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  ConflictException,
  Logger,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { DataSource, QueryFailedError } from 'typeorm';

import { PaymentsService } from './payments.service';
import { BillPaymentDto } from './dto/bill-payment.dto';
import { Payment } from './entities/payment.entity';

import { Account } from '../accounts/entities/account.entity';
import { AccountType } from '../../common/enums/account-type.enum';

describe('PaymentsService', () => {
  let service: PaymentsService;

  const mockManager = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn(),
  };

  const validDto: BillPaymentDto = {
    customerAccountNumber: '1000000001',
    merchantAccountNumber: '2000000001',
    amount: 1000,
  };

  const bankAccountNumber = '9999999999';

  const transactionDate = new Date(
    '2026-11-25T09:05:00.000Z',
  );

  let customer: Account;
  let merchant: Account;
  let bank: Account;

  beforeEach(() => {
    jest.resetAllMocks();

    // Suppress expected application logs during unit tests.
    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);

    // Create fresh account fixtures for every test.
    customer = {
      id: 'customer-id',
      accountNumber: '1000000001',
      name: 'John Doe',
      accountType: AccountType.CUSTOMER,
      balance: '5000.00',
      createdAt: transactionDate,
      updatedAt: transactionDate,
    };

    merchant = {
      id: 'merchant-id',
      accountNumber: '2000000001',
      name: 'Kenya Power',
      accountType: AccountType.MERCHANT,
      balance: '0.00',
      createdAt: transactionDate,
      updatedAt: transactionDate,
    };

    bank = {
      id: 'bank-id',
      accountNumber: bankAccountNumber,
      name: 'Bank Fee Account',
      accountType: AccountType.BANK,
      balance: '0.00',
      createdAt: transactionDate,
      updatedAt: transactionDate,
    };

    // Mock bank fee account configuration.
    mockConfigService.getOrThrow.mockReturnValue(
      bankAccountNumber,
    );

    // Mock account retrieval.
    mockManager.findOne.mockImplementation(
      async (
        _entity: unknown,
        options: {
          where: {
            accountNumber: string;
          };
        },
      ) => {
        return (
          [customer, merchant, bank].find(
            (account) =>
              account.accountNumber ===
              options.where.accountNumber,
          ) ?? null
        );
      },
    );

    // Mock entity creation.
    mockManager.create.mockImplementation(
      (_entity: unknown, value: object) => value,
    );

    // Mock database persistence.
    mockManager.save.mockImplementation(
      async (_entity: unknown, value: object) => {
        if (Array.isArray(value)) {
          return value;
        }

        return {
          ...value,
          id: 'payment-id',
          createdAt: transactionDate,
        };
      },
    );

    // Execute transaction callbacks using the mocked manager.
    mockDataSource.transaction.mockImplementation(
      async (
        callback: (
          manager: typeof mockManager,
        ) => Promise<unknown>,
      ) => {
        return callback(mockManager);
      },
    );

    // Direct dependency injection.
    service = new PaymentsService(
      mockDataSource as unknown as DataSource,
      mockConfigService as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================
  // SUCCESSFUL BILL PAYMENTS
  // ==========================================

  describe('successful bill payments', () => {
    it('should successfully process a bill payment', async () => {
      const result = await service.payBill(validDto);

      expect(result).toEqual({
        success: true,
        message: 'Bill payment successful',
        data: {
          reference: expect.stringMatching(/^PAY-/),
          customerAccountNumber: '1000000001',
          merchantAccountNumber: '2000000001',
          merchantName: 'Kenya Power',
          currency: 'KES',
          billAmount: '1000.00',
          transactionCharge: '30.00',
          totalDebit: '1030.00',
          availableBalance: '3970.00',
          status: 'SUCCESS',
          transactionDate,
        },
      });
    });

    it('should debit the customer by the bill amount plus KES 30', async () => {
      await service.payBill(validDto);

      expect(customer.balance).toBe('3970.00');
    });

    it('should credit the merchant with the bill amount', async () => {
      await service.payBill(validDto);

      expect(merchant.balance).toBe('1000.00');
    });

    it('should credit the bank with KES 30', async () => {
      await service.payBill(validDto);

      expect(bank.balance).toBe('30.00');
    });

    it('should preserve existing merchant and bank balances', async () => {
      merchant.balance = '2000.00';
      bank.balance = '90.00';

      await service.payBill(validDto);

      expect(customer.balance).toBe('3970.00');
      expect(merchant.balance).toBe('3000.00');
      expect(bank.balance).toBe('120.00');
    });

    it('should preserve the total balance across participating accounts', async () => {
      const totalBefore =
        Number(customer.balance) +
        Number(merchant.balance) +
        Number(bank.balance);

      await service.payBill(validDto);

      const totalAfter =
        Number(customer.balance) +
        Number(merchant.balance) +
        Number(bank.balance);

      expect(totalAfter).toBeCloseTo(totalBefore, 2);
    });

    it('should allow payment using the exact available balance', async () => {
      customer.balance = '1030.00';

      const result = await service.payBill(validDto);

      expect(customer.balance).toBe('0.00');
      expect(merchant.balance).toBe('1000.00');
      expect(bank.balance).toBe('30.00');

      expect(result.data.availableBalance).toBe('0.00');
    });

    it('should correctly process decimal payment amounts', async () => {
      const result = await service.payBill({
        ...validDto,
        amount: 250.75,
      });

      expect(customer.balance).toBe('4719.25');
      expect(merchant.balance).toBe('250.75');
      expect(bank.balance).toBe('30.00');

      expect(result.data.billAmount).toBe('250.75');
      expect(result.data.totalDebit).toBe('280.75');
    });

    it('should process the minimum allowed payment amount', async () => {
      const result = await service.payBill({
        ...validDto,
        amount: 0.01,
      });

      expect(customer.balance).toBe('4969.99');
      expect(merchant.balance).toBe('0.01');
      expect(bank.balance).toBe('30.00');

      expect(result.data.totalDebit).toBe('30.01');
    });

    it('should charge KES 30 for every successful payment', async () => {
      await service.payBill(validDto);

      await service.payBill({
        ...validDto,
        amount: 500,
      });

      expect(customer.balance).toBe('3440.00');
      expect(merchant.balance).toBe('1500.00');
      expect(bank.balance).toBe('60.00');
    });

    it('should return the current available balance', async () => {
      const result = await service.payBill(validDto);

      expect(result.data.availableBalance).toBe(
        customer.balance,
      );
    });

    it('should return KES as the transaction currency', async () => {
      const result = await service.payBill(validDto);

      expect(result.data.currency).toBe('KES');
    });
  });

  // ==========================================
  // PAYMENT RECORDS
  // ==========================================

  describe('payment records', () => {
    it('should generate a valid payment reference', async () => {
      const result = await service.payBill(validDto);

      expect(result.data.reference).toMatch(
        /^PAY-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should generate a unique reference for every payment', async () => {
      const first = await service.payBill(validDto);

      const second = await service.payBill(validDto);

      expect(first.data.reference).not.toBe(
        second.data.reference,
      );
    });

    it('should create a complete payment record', async () => {
      await service.payBill(validDto);

      expect(mockManager.create).toHaveBeenCalledWith(
        Payment,
        {
          reference: expect.stringMatching(/^PAY-/),
          customerAccountNumber: customer.accountNumber,
          merchantAccountNumber: merchant.accountNumber,
          amount: '1000.00',
          charge: '30.00',
          totalDebit: '1030.00',
          balanceBefore: '5000.00',
          balanceAfter: '3970.00',
          status: 'SUCCESS',
        },
      );
    });

    it('should persist all three updated accounts', async () => {
      await service.payBill(validDto);

      expect(mockManager.save).toHaveBeenCalledWith(
        Account,
        [
          expect.objectContaining({
            accountNumber: customer.accountNumber,
            balance: '3970.00',
          }),
          expect.objectContaining({
            accountNumber: merchant.accountNumber,
            balance: '1000.00',
          }),
          expect.objectContaining({
            accountNumber: bank.accountNumber,
            balance: '30.00',
          }),
        ],
      );
    });

    it('should persist the payment record', async () => {
      await service.payBill(validDto);

      expect(mockManager.save).toHaveBeenCalledWith(
        Payment,
        expect.objectContaining({
          reference: expect.stringMatching(/^PAY-/),
          amount: '1000.00',
          charge: '30.00',
          totalDebit: '1030.00',
          status: 'SUCCESS',
        }),
      );
    });

    it('should return the persisted payment reference', async () => {
      const result = await service.payBill(validDto);

      expect(mockManager.save).toHaveBeenCalledWith(
        Payment,
        expect.objectContaining({
          reference: result.data.reference,
        }),
      );
    });

    it('should return the payment creation date', async () => {
      const result = await service.payBill(validDto);

      expect(result.data.transactionDate).toEqual(
        transactionDate,
      );
    });
  });

  // ==========================================
  // PAYMENT AMOUNT VALIDATION
  // ==========================================

  describe('payment amount validation', () => {
    it('should reject insufficient customer funds', async () => {
      customer.balance = '500.00';

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(BadRequestException);

      expect(mockManager.save).not.toHaveBeenCalled();
      expect(mockManager.create).not.toHaveBeenCalled();
    });

    it('should reject when balance covers the bill but not the charge', async () => {
      customer.balance = '1000.00';

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        'Insufficient funds to cover bill amount and transaction charge',
      );

      expect(customer.balance).toBe('1000.00');
      expect(merchant.balance).toBe('0.00');
      expect(bank.balance).toBe('0.00');

      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('should reject a customer with zero balance', async () => {
      customer.balance = '0.00';

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(BadRequestException);

      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it.each([
      0,
      -100,
      -0.01,
      NaN,
      Infinity,
      -Infinity,
      100.123,
      0.001,
      1000000000000,
    ])(
      'should reject invalid numeric amount: %p',
      async (amount) => {
        await expect(
          service.payBill({
            ...validDto,
            amount,
          }),
        ).rejects.toThrow('Invalid payment amount');

        expect(
          mockDataSource.transaction,
        ).not.toHaveBeenCalled();
      },
    );

    it.each([
      '1000',
      '',
      null,
      undefined,
      true,
      {},
      [],
    ])(
      'should reject non-numeric amount: %p',
      async (amount) => {
        const dto = {
          ...validDto,
          amount,
        } as unknown as BillPaymentDto;

        await expect(
          service.payBill(dto),
        ).rejects.toThrow(BadRequestException);

        expect(
          mockDataSource.transaction,
        ).not.toHaveBeenCalled();
      },
    );
  });

  // ==========================================
  // ACCOUNT NUMBER VALIDATION
  // ==========================================

  describe('account number validation', () => {
    it('should reject identical customer and merchant accounts', async () => {
      await expect(
        service.payBill({
          ...validDto,
          merchantAccountNumber:
            validDto.customerAccountNumber,
        }),
      ).rejects.toThrow(
        'Customer, merchant and bank accounts must be different',
      );

      expect(
        mockDataSource.transaction,
      ).not.toHaveBeenCalled();
    });

    it('should reject the bank account as the customer', async () => {
      await expect(
        service.payBill({
          ...validDto,
          customerAccountNumber: bankAccountNumber,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(
        mockDataSource.transaction,
      ).not.toHaveBeenCalled();
    });

    it('should reject the bank account as the merchant', async () => {
      await expect(
        service.payBill({
          ...validDto,
          merchantAccountNumber: bankAccountNumber,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(
        mockDataSource.transaction,
      ).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // ACCOUNT EXISTENCE VALIDATION
  // ==========================================

  describe('account existence validation', () => {
    it('should reject a nonexistent customer account', async () => {
      await expect(
        service.payBill({
          ...validDto,
          customerAccountNumber: '1111111111',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('should return the correct missing customer message', async () => {
      await expect(
        service.payBill({
          ...validDto,
          customerAccountNumber: '1111111111',
        }),
      ).rejects.toThrow('Customer account not found');
    });

    it('should reject a nonexistent merchant account', async () => {
      await expect(
        service.payBill({
          ...validDto,
          merchantAccountNumber: '2222222222',
        }),
      ).rejects.toThrow('Merchant account not found');

      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('should reject a missing bank fee account', async () => {
      mockConfigService.getOrThrow.mockReturnValue(
        '8888888888',
      );

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        'Bank fee account is unavailable',
      );

      expect(mockManager.save).not.toHaveBeenCalled();

      expect(customer.balance).toBe('5000.00');
      expect(merchant.balance).toBe('0.00');
      expect(bank.balance).toBe('0.00');
    });

    it('should return an internal server error for a missing bank account', async () => {
      mockConfigService.getOrThrow.mockReturnValue(
        '8888888888',
      );

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ==========================================
  // ACCOUNT TYPE VALIDATION
  // ==========================================

  describe('account type validation', () => {
    it('should reject an invalid customer account type', async () => {
      customer.accountType = AccountType.MERCHANT;

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        'Source account must be a customer account',
      );

      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('should reject an invalid merchant account type', async () => {
      merchant.accountType = AccountType.CUSTOMER;

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        'Destination account must be a merchant account',
      );

      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('should reject an invalid bank account type', async () => {
      bank.accountType = AccountType.CUSTOMER;

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow('Invalid bank fee account');

      expect(mockManager.save).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // BANK ACCOUNT CONFIGURATION
  // ==========================================

  describe('bank account configuration', () => {
    it('should retrieve the bank fee account from configuration', async () => {
      await service.payBill(validDto);

      expect(
        mockConfigService.getOrThrow,
      ).toHaveBeenCalledWith(
        'BANK_FEE_ACCOUNT_NUMBER',
      );
    });

    it('should handle missing bank account configuration', async () => {
      mockConfigService.getOrThrow.mockImplementationOnce(
        () => {
          throw new Error('Missing configuration');
        },
      );

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(
        mockDataSource.transaction,
      ).not.toHaveBeenCalled();
    });

    it.each([
      '',
      'INVALID',
      '123',
      'ABC123',
      '1'.repeat(31),
      null,
      undefined,
      9999999999,
    ])(
      'should reject invalid bank configuration: %p',
      async (accountNumber) => {
        mockConfigService.getOrThrow.mockReturnValue(
          accountNumber,
        );

        await expect(
          service.payBill(validDto),
        ).rejects.toThrow(
          'Bank fee account configuration is invalid',
        );

        expect(
          mockDataSource.transaction,
        ).not.toHaveBeenCalled();
      },
    );
  });

  // ==========================================
  // DATABASE TRANSACTIONS AND LOCKING
  // ==========================================

  describe('database transactions', () => {
    it('should execute payment inside a database transaction', async () => {
      await service.payBill(validDto);

      expect(
        mockDataSource.transaction,
      ).toHaveBeenCalledTimes(1);

      expect(
        mockDataSource.transaction,
      ).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should acquire pessimistic write locks on all three accounts', async () => {
      await service.payBill(validDto);

      expect(mockManager.findOne).toHaveBeenCalledTimes(3);

      for (const accountNumber of [
        customer.accountNumber,
        merchant.accountNumber,
        bank.accountNumber,
      ]) {
        expect(mockManager.findOne).toHaveBeenCalledWith(
          Account,
          {
            where: {
              accountNumber,
            },
            lock: {
              mode: 'pessimistic_write',
            },
          },
        );
      }
    });

    it('should acquire locks in consistent account number order', async () => {
      customer.accountNumber = '7000000001';
      merchant.accountNumber = '2000000001';

      await service.payBill({
        ...validDto,
        customerAccountNumber: customer.accountNumber,
        merchantAccountNumber: merchant.accountNumber,
      });

      const lockedAccounts =
        mockManager.findOne.mock.calls.map(
          (call) => call[1].where.accountNumber,
        );

      expect(lockedAccounts).toEqual([
        '2000000001',
        '7000000001',
        '9999999999',
      ]);
    });

    it('should save account balances before saving the payment record', async () => {
      await service.payBill(validDto);

      expect(mockManager.save).toHaveBeenNthCalledWith(
        1,
        Account,
        [customer, merchant, bank],
      );

      expect(mockManager.save).toHaveBeenNthCalledWith(
        2,
        Payment,
        expect.any(Object),
      );
    });

    it('should execute exactly two save operations', async () => {
      await service.payBill(validDto);

      expect(mockManager.save).toHaveBeenCalledTimes(2);
    });

    it('should reject payment when account persistence fails', async () => {
      mockManager.save.mockRejectedValueOnce(
        new Error('Failed to save accounts'),
      );

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(mockManager.create).not.toHaveBeenCalled();

      expect(mockManager.save).toHaveBeenCalledTimes(1);
    });

    it('should reject payment when payment record persistence fails', async () => {
      mockManager.save
        .mockResolvedValueOnce([
          customer,
          merchant,
          bank,
        ])
        .mockRejectedValueOnce(
          new Error('Failed to save payment'),
        );

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        'Unable to process bill payment',
      );

      expect(mockManager.save).toHaveBeenCalledTimes(2);
    });

    it('should handle database connection failures', async () => {
      mockDataSource.transaction.mockRejectedValueOnce(
        new Error('Database unavailable'),
      );

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(mockManager.findOne).not.toHaveBeenCalled();
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('should handle account retrieval failures', async () => {
      mockManager.findOne.mockRejectedValueOnce(
        new Error('Failed to retrieve account'),
      );

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('should handle transaction commit failures', async () => {
      mockDataSource.transaction.mockImplementationOnce(
        async (
          callback: (
            manager: typeof mockManager,
          ) => Promise<unknown>,
        ) => {
          await callback(mockManager);

          throw new Error(
            'Transaction commit failed',
          );
        },
      );

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should not log payment success when the transaction fails', async () => {
      mockDataSource.transaction.mockRejectedValueOnce(
        new Error('Transaction failed'),
      );

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(Logger.prototype.log).not.toHaveBeenCalledWith(
        expect.stringContaining(
          'Bill payment completed successfully',
        ),
      );
    });
  });

  // ==========================================
  // POSTGRESQL ERROR HANDLING
  // ==========================================

  describe('PostgreSQL error handling', () => {
    it('should handle duplicate payment references', async () => {
      const driverError = Object.assign(
        new Error('Duplicate payment reference'),
        {
          code: '23505',
          constraint: 'payment_reference_unique',
        },
      );

      const queryError = new QueryFailedError(
        'INSERT INTO payments',
        [],
        driverError,
      );

      mockManager.save
        .mockResolvedValueOnce([
          customer,
          merchant,
          bank,
        ])
        .mockRejectedValueOnce(queryError);

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(ConflictException);
    });

    it.each([
      {
        code: '23503',
        description: 'foreign key constraint violation',
      },
      {
        code: '23514',
        description: 'check constraint violation',
      },
      {
        code: '23502',
        description: 'not-null constraint violation',
      },
      {
        code: '22003',
        description: 'numeric value out of range',
      },
      {
        code: '22001',
        description: 'value exceeds column length',
      },
      {
        code: '42703',
        description: 'database column does not exist',
      },
      {
        code: '42P01',
        description: 'database table does not exist',
      },
      {
        code: '40P01',
        description: 'database deadlock',
      },
      {
        code: '40001',
        description: 'serialization failure',
      },
      {
        code: 'UNKNOWN',
        description: 'unknown PostgreSQL error',
      },
    ])(
      'should handle $description ($code)',
      async ({ code, description }) => {
        const driverError = Object.assign(
          new Error(description),
          {
            code,
            table: 'accounts',
            column: 'balance',
            constraint: 'test_constraint',
          },
        );

        const queryError = new QueryFailedError(
          'UPDATE accounts',
          [],
          driverError,
        );

        mockManager.save.mockRejectedValueOnce(
          queryError,
        );

        await expect(
          service.payBill(validDto),
        ).rejects.toThrow(
          InternalServerErrorException,
        );
      },
    );

    it('should handle database errors without a PostgreSQL error code', async () => {
      const queryError = new QueryFailedError(
        'UPDATE accounts',
        [],
        new Error('Unknown database failure'),
      );

      mockManager.save.mockRejectedValueOnce(
        queryError,
      );

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        'Unable to process bill payment',
      );
    });

    it('should not expose database error details to the client', async () => {
      const driverError = Object.assign(
        new Error('Sensitive database error details'),
        {
          code: '23514',
          detail: 'Internal database information',
        },
      );

      mockManager.save.mockRejectedValueOnce(
        new QueryFailedError(
          'INSERT INTO payments',
          [],
          driverError,
        ),
      );

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        'Unable to process bill payment',
      );
    });

    it('should handle unknown thrown values', async () => {
      mockDataSource.transaction.mockRejectedValueOnce(
        'Unknown database failure',
      );

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ==========================================
  // APPLICATION LOGGING
  // ==========================================

  describe('application logging', () => {
    it('should log payment processing', async () => {
      await service.payBill(validDto);

      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Processing bill payment',
        ),
      );
    });

    it('should log successful payment completion', async () => {
      await service.payBill(validDto);

      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Bill payment completed successfully',
        ),
      );
    });

    it('should log rejected payments', async () => {
      customer.balance = '100.00';

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(BadRequestException);

      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('Payment rejected'),
      );
    });

    it('should log missing bank fee account errors', async () => {
      mockConfigService.getOrThrow.mockReturnValue(
        '8888888888',
      );

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Bank fee account is unavailable',
        ),
        expect.any(String),
      );
    });

    it('should log unexpected database failures', async () => {
      mockDataSource.transaction.mockRejectedValueOnce(
        new Error('Database unavailable'),
      );

      await expect(
        service.payBill(validDto),
      ).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('Unexpected error'),
      );
    });
  });
});