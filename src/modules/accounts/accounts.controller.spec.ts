import { Test, TestingModule } from '@nestjs/testing';

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';

import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { RegisterAccountDto } from './dto/register-account.dto';
import { AccountType } from '../../common/enums/account-type.enum';

describe('AccountsController', () => {
  let controller: AccountsController;
  let module: TestingModule;

  const mockAccountsService = {
    register: jest.fn(),
    getMiniStatement: jest.fn(),
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

  const mockAccountResponse = {
    success: true,
    message: 'Account registered successfully',
    data: {
      id: 'customer-id',
      accountNumber: customerDto.accountNumber,
      name: customerDto.name,
      accountType: AccountType.CUSTOMER,
      balance: '5000.00',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const mockStatementResponse = {
    success: true,
    message: 'Mini statement retrieved successfully',
    data: {
      accountNumber: customerDto.accountNumber,
      accountName: customerDto.name,
      accountType: AccountType.CUSTOMER,
      currency: 'KES',
      availableBalance: '3970.00',
      transactionCount: 1,
      transactions: [
        {
          reference: 'PAY-123456',
          transactionDate: new Date(),
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
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    module = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [
        {
          provide: AccountsService,
          useValue: mockAccountsService,
        },
      ],
    }).compile();

    controller = module.get<AccountsController>(
      AccountsController,
    );
  });

  afterEach(async () => {
    await module?.close();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should register a customer account', async () => {
      mockAccountsService.register.mockResolvedValue(
        mockAccountResponse,
      );

      const result = await controller.register(customerDto);

      expect(result).toEqual(mockAccountResponse);

      expect(
        mockAccountsService.register,
      ).toHaveBeenCalledWith(customerDto);

      expect(
        mockAccountsService.register,
      ).toHaveBeenCalledTimes(1);
    });

    it('should register a merchant account', async () => {
      const response = {
        ...mockAccountResponse,
        data: {
          ...mockAccountResponse.data,
          accountNumber: merchantDto.accountNumber,
          name: merchantDto.name,
          accountType: AccountType.MERCHANT,
          balance: '0.00',
        },
      };

      mockAccountsService.register.mockResolvedValue(
        response,
      );

      const result = await controller.register(merchantDto);

      expect(result).toEqual(response);

      expect(
        mockAccountsService.register,
      ).toHaveBeenCalledWith(merchantDto);
    });

    it('should propagate duplicate account errors', async () => {
      mockAccountsService.register.mockRejectedValue(
        new ConflictException(
          'Account number already exists',
        ),
      );

      await expect(
        controller.register(customerDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should propagate database errors', async () => {
      mockAccountsService.register.mockRejectedValue(
        new InternalServerErrorException(
          'Database unavailable',
        ),
      );

      await expect(
        controller.register(customerDto),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('getMiniStatement', () => {
    it('should retrieve a customer mini statement', async () => {
      mockAccountsService.getMiniStatement.mockResolvedValue(
        mockStatementResponse,
      );

      const result = await controller.getMiniStatement(
        customerDto.accountNumber,
      );

      expect(result).toEqual(mockStatementResponse);

      expect(
        mockAccountsService.getMiniStatement,
      ).toHaveBeenCalledWith(customerDto.accountNumber);
    });

    it('should return an empty mini statement', async () => {
      const response = {
        ...mockStatementResponse,
        data: {
          ...mockStatementResponse.data,
          availableBalance: '5000.00',
          transactionCount: 0,
          transactions: [],
        },
      };

      mockAccountsService.getMiniStatement.mockResolvedValue(
        response,
      );

      const result = await controller.getMiniStatement(
        customerDto.accountNumber,
      );

      expect(result.data.transactionCount).toBe(0);
      expect(result.data.transactions).toEqual([]);
    });

    it('should propagate missing account errors', async () => {
      mockAccountsService.getMiniStatement.mockRejectedValue(
        new NotFoundException('Account not found'),
      );

      await expect(
        controller.getMiniStatement('1111111111'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject merchant mini statements', async () => {
      mockAccountsService.getMiniStatement.mockRejectedValue(
        new BadRequestException(
          'Mini statement is only available for customer accounts',
        ),
      );

      await expect(
        controller.getMiniStatement(
          merchantDto.accountNumber,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([
      '',
      'ABC123',
      '123',
      '12345',
      '12345@6789',
      '1000 000001',
      '1'.repeat(31),
    ])(
      'should reject invalid account number: %p',
      async (accountNumber) => {
        await expect(
          Promise.resolve().then(() =>
            controller.getMiniStatement(accountNumber),
          ),
        ).rejects.toThrow(BadRequestException);

        expect(
          mockAccountsService.getMiniStatement,
        ).not.toHaveBeenCalled();
      },
    );

    it('should propagate unexpected service errors', async () => {
      mockAccountsService.getMiniStatement.mockRejectedValue(
        new Error('Database unavailable'),
      );

      await expect(
        controller.getMiniStatement(
          customerDto.accountNumber,
        ),
      ).rejects.toThrow('Database unavailable');
    });
  });
});