import { DataSource, Repository, QueryFailedError } from 'typeorm';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { AccountsService } from './accounts.service';
import { Account } from './entities/account.entity';
import { RegisterAccountDto } from './dto/register-account.dto';
import { AccountType } from '../../common/enums/account-type.enum';
import { Payment } from '../payments/entities/payment.entity';

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: jest.fn(() => () => undefined),
  getRepositoryToken: jest.fn(
    (entity: { name: string }) => `${entity.name}Repository`,
  ),
}));

describe('AccountsService', () => {
  let service: AccountsService;

  const mockAccountRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockManager = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  const customerDto: RegisterAccountDto = {
    accountNumber: '1000000001',
    name: 'John Doe',
    accountType: AccountType.CUSTOMER,
    openingBalance: 5000,
  };

  const merchantDto: RegisterAccountDto = {
    accountNumber: '2000000001',
    name: 'Kenya Power',
    accountType: AccountType.MERCHANT,
    openingBalance: 0,
  };

  const mockCustomer: Account = {
    id: 'customer-id',
    accountNumber: '1000000001',
    name: 'John Doe',
    accountType: AccountType.CUSTOMER,
    balance: '5000.00',
    createdAt: new Date('2026-11-25T09:00:00Z'),
    updatedAt: new Date('2026-11-25T09:00:00Z'),
  };

  const mockMerchant: Account = {
    id: 'merchant-id',
    accountNumber: '2000000001',
    name: 'Kenya Power',
    accountType: AccountType.MERCHANT,
    balance: '0.00',
    createdAt: new Date('2026-11-25T09:00:00Z'),
    updatedAt: new Date('2026-11-25T09:00:00Z'),
  };

  const mockPayment: Payment = {
    id: 'payment-id',
    reference: 'PAY-123456',
    customerAccountNumber: mockCustomer.accountNumber,
    customerAccount: mockCustomer,
    merchantAccountNumber: mockMerchant.accountNumber,
    merchantAccount: mockMerchant,
    amount: '1000.00',
    charge: '30.00',
    totalDebit: '1030.00',
    balanceBefore: '5000.00',
    balanceAfter: '3970.00',
    status: 'SUCCESS',
    createdAt: new Date('2026-11-25T10:00:00Z'),
  };

  beforeEach(() => {
    jest.resetAllMocks();

    mockDataSource.transaction.mockImplementation(
      async (_isolationLevel, callback) => {
        return callback(mockManager);
      },
    );

    service = new AccountsService(
      mockAccountRepository as unknown as Repository<Account>,
      mockDataSource as unknown as DataSource,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================
  // ACCOUNT REGISTRATION
  // ==========================================

  describe('register', () => {
    it('should successfully register a customer account', async () => {
      mockAccountRepository.findOne.mockResolvedValue(null);
      mockAccountRepository.create.mockReturnValue(mockCustomer);
      mockAccountRepository.save.mockResolvedValue(mockCustomer);

      const result = await service.register(customerDto);

      expect(result).toEqual({
        success: true,
        message: 'Account registered successfully',
        data: mockCustomer,
      });

      expect(mockAccountRepository.findOne).toHaveBeenCalledWith({
        where: {
          accountNumber: customerDto.accountNumber,
        },
      });

      expect(mockAccountRepository.create).toHaveBeenCalledWith({
        accountNumber: customerDto.accountNumber,
        name: customerDto.name,
        accountType: AccountType.CUSTOMER,
        balance: '5000.00',
      });

      expect(mockAccountRepository.save).toHaveBeenCalledWith(mockCustomer);
    });

    it('should successfully register a merchant account', async () => {
      mockAccountRepository.findOne.mockResolvedValue(null);
      mockAccountRepository.create.mockReturnValue(mockMerchant);
      mockAccountRepository.save.mockResolvedValue(mockMerchant);

      const result = await service.register(merchantDto);

      expect(result.success).toBe(true);
      expect(result.data.accountType).toBe(AccountType.MERCHANT);
      expect(result.data.balance).toBe('0.00');

      expect(mockAccountRepository.create).toHaveBeenCalledWith({
        accountNumber: merchantDto.accountNumber,
        name: merchantDto.name,
        accountType: AccountType.MERCHANT,
        balance: '0.00',
      });
    });

    it('should allow registration with zero opening balance', async () => {
      const dto = {
        ...customerDto,
        openingBalance: 0,
      };

      const account = {
        ...mockCustomer,
        balance: '0.00',
      };

      mockAccountRepository.findOne.mockResolvedValue(null);
      mockAccountRepository.create.mockReturnValue(account);
      mockAccountRepository.save.mockResolvedValue(account);

      const result = await service.register(dto);

      expect(result.data.balance).toBe('0.00');

      expect(mockAccountRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: '0.00',
        }),
      );
    });

    it('should correctly handle decimal opening balances', async () => {
      const dto = {
        ...customerDto,
        openingBalance: 1500.75,
      };

      const account = {
        ...mockCustomer,
        balance: '1500.75',
      };

      mockAccountRepository.findOne.mockResolvedValue(null);
      mockAccountRepository.create.mockReturnValue(account);
      mockAccountRepository.save.mockResolvedValue(account);

      const result = await service.register(dto);

      expect(result.data.balance).toBe('1500.75');

      expect(mockAccountRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: '1500.75',
        }),
      );
    });

    it('should trim whitespace from the account name', async () => {
      const dto = {
        ...customerDto,
        name: '  John Doe  ',
      };

      mockAccountRepository.findOne.mockResolvedValue(null);
      mockAccountRepository.create.mockReturnValue(mockCustomer);
      mockAccountRepository.save.mockResolvedValue(mockCustomer);

      await service.register(dto);

      expect(mockAccountRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'John Doe',
        }),
      );
    });

    it('should reject an existing account number', async () => {
      mockAccountRepository.findOne.mockResolvedValue(mockCustomer);

      await expect(service.register(customerDto)).rejects.toThrow(
        ConflictException,
      );

      expect(mockAccountRepository.create).not.toHaveBeenCalled();
      expect(mockAccountRepository.save).not.toHaveBeenCalled();
    });

    it('should handle PostgreSQL unique constraint violations', async () => {
      mockAccountRepository.findOne.mockResolvedValue(null);
      mockAccountRepository.create.mockReturnValue(mockCustomer);

      const driverError = Object.assign(new Error('Duplicate account number'), {
        code: '23505',
      });

      const queryError = new QueryFailedError(
        'INSERT INTO accounts',
        [],
        driverError,
      );

      mockAccountRepository.save.mockRejectedValue(queryError);

      await expect(service.register(customerDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should propagate unexpected database errors', async () => {
      mockAccountRepository.findOne.mockResolvedValue(null);
      mockAccountRepository.create.mockReturnValue(mockCustomer);

      const error = new Error('Database connection failed');

      mockAccountRepository.save.mockRejectedValue(error);

      await expect(service.register(customerDto)).rejects.toBe(error);
    });

    it('should propagate non-duplicate PostgreSQL errors', async () => {
      mockAccountRepository.findOne.mockResolvedValue(null);
      mockAccountRepository.create.mockReturnValue(mockCustomer);

      const driverError = Object.assign(
        new Error('Check constraint violation'),
        {
          code: '23514',
        },
      );

      const queryError = new QueryFailedError(
        'INSERT INTO accounts',
        [],
        driverError,
      );

      mockAccountRepository.save.mockRejectedValue(queryError);

      await expect(service.register(customerDto)).rejects.toBe(queryError);
    });

    it('should handle account lookup failure', async () => {
      mockAccountRepository.findOne.mockRejectedValue(
        new Error('Database unavailable'),
      );

      await expect(service.register(customerDto)).rejects.toThrow(
        'Database unavailable',
      );

      expect(mockAccountRepository.save).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // MINI STATEMENT
  // ==========================================

  describe('getMiniStatement', () => {
    it('should successfully retrieve a customer mini statement', async () => {
      mockManager.findOne.mockResolvedValue({
        ...mockCustomer,
        balance: '3970.00',
      });

      mockManager.find.mockResolvedValue([mockPayment]);

      const result = await service.getMiniStatement(mockCustomer.accountNumber);

      expect(result).toEqual({
        success: true,
        message: 'Mini statement retrieved successfully',
        data: {
          accountNumber: mockCustomer.accountNumber,
          accountName: mockCustomer.name,
          accountType: AccountType.CUSTOMER,
          currency: 'KES',
          availableBalance: '3970.00',
          transactionCount: 1,
          transactions: [
            {
              reference: mockPayment.reference,
              transactionDate: mockPayment.createdAt,
              description: 'Bill payment to Kenya Power',
              transactionType: 'DEBIT',
              billAmount: '1000.00',
              charge: '30.00',
              totalAmount: '1030.00',
              balanceAfter: '3970.00',
              status: 'SUCCESS',
            },
          ],
        },
      });
    });

    it('should return an empty statement for a new customer', async () => {
      mockManager.findOne.mockResolvedValue(mockCustomer);
      mockManager.find.mockResolvedValue([]);

      const result = await service.getMiniStatement(mockCustomer.accountNumber);

      expect(result.success).toBe(true);
      expect(result.data.availableBalance).toBe('5000.00');
      expect(result.data.transactionCount).toBe(0);
      expect(result.data.transactions).toEqual([]);
    });

    it('should query only the last five transactions', async () => {
      mockManager.findOne.mockResolvedValue(mockCustomer);
      mockManager.find.mockResolvedValue([]);

      await service.getMiniStatement(mockCustomer.accountNumber);

      expect(mockManager.find).toHaveBeenCalledWith(Payment, {
        where: {
          customerAccountNumber: mockCustomer.accountNumber,
        },
        relations: {
          merchantAccount: true,
        },
        order: {
          createdAt: 'DESC',
          id: 'DESC',
        },
        take: 5,
      });
    });

    it('should return five transactions when available', async () => {
      const payments = Array.from({ length: 5 }, (_, index) => ({
        ...mockPayment,
        id: `payment-${index}`,
        reference: `PAY-${index}`,
        createdAt: new Date(Date.UTC(2026, 10, 25, 10 - index)),
      }));

      mockManager.findOne.mockResolvedValue(mockCustomer);
      mockManager.find.mockResolvedValue(payments);

      const result = await service.getMiniStatement(mockCustomer.accountNumber);

      expect(result.data.transactionCount).toBe(5);
      expect(result.data.transactions).toHaveLength(5);
    });

    it('should preserve the latest-first transaction ordering', async () => {
      const latestPayment = {
        ...mockPayment,
        reference: 'PAY-LATEST',
        createdAt: new Date('2026-11-25T12:00:00Z'),
      };

      const olderPayment = {
        ...mockPayment,
        reference: 'PAY-OLDER',
        createdAt: new Date('2026-11-25T10:00:00Z'),
      };

      mockManager.findOne.mockResolvedValue(mockCustomer);
      mockManager.find.mockResolvedValue([latestPayment, olderPayment]);

      const result = await service.getMiniStatement(mockCustomer.accountNumber);

      expect(result.data.transactions[0].reference).toBe('PAY-LATEST');

      expect(result.data.transactions[1].reference).toBe('PAY-OLDER');
    });

    it('should return the current available account balance', async () => {
      mockManager.findOne.mockResolvedValue({
        ...mockCustomer,
        balance: '2500.00',
      });

      mockManager.find.mockResolvedValue([mockPayment]);

      const result = await service.getMiniStatement(mockCustomer.accountNumber);

      expect(result.data.availableBalance).toBe('2500.00');
    });

    it('should use REPEATABLE READ transaction isolation', async () => {
      mockManager.findOne.mockResolvedValue(mockCustomer);
      mockManager.find.mockResolvedValue([]);

      await service.getMiniStatement(mockCustomer.accountNumber);

      expect(mockDataSource.transaction).toHaveBeenCalledWith(
        'REPEATABLE READ',
        expect.any(Function),
      );
    });

    it('should throw NotFoundException for a nonexistent account', async () => {
      mockManager.findOne.mockResolvedValue(null);

      await expect(service.getMiniStatement('9999999999')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockManager.find).not.toHaveBeenCalled();
    });

    it('should reject mini statements for merchant accounts', async () => {
      mockManager.findOne.mockResolvedValue(mockMerchant);

      await expect(
        service.getMiniStatement(mockMerchant.accountNumber),
      ).rejects.toThrow(BadRequestException);

      expect(mockManager.find).not.toHaveBeenCalled();
    });

    it('should reject mini statements for bank accounts', async () => {
      mockManager.findOne.mockResolvedValue({
        ...mockCustomer,
        accountNumber: '9999999999',
        accountType: AccountType.BANK,
      });

      await expect(service.getMiniStatement('9999999999')).rejects.toThrow(
        BadRequestException,
      );

      expect(mockManager.find).not.toHaveBeenCalled();
    });

    it('should propagate transaction retrieval errors', async () => {
      mockManager.findOne.mockResolvedValue(mockCustomer);

      mockManager.find.mockRejectedValue(
        new Error('Failed to retrieve transactions'),
      );

      await expect(
        service.getMiniStatement(mockCustomer.accountNumber),
      ).rejects.toThrow('Failed to retrieve transactions');
    });

    it('should propagate database transaction errors', async () => {
      mockDataSource.transaction.mockRejectedValue(
        new Error('Transaction failed'),
      );

      await expect(
        service.getMiniStatement(mockCustomer.accountNumber),
      ).rejects.toThrow('Transaction failed');
    });
  });
});
