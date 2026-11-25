import { Test, TestingModule } from '@nestjs/testing';

import {
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { BillPaymentDto } from './dto/bill-payment.dto';
import { BillPaymentResponseDto } from './dto/bill-payment-response.dto';

describe('PaymentsController', () => {
  let controller: PaymentsController;

  const mockPaymentsService = {
    payBill: jest.fn(),
  };

  const validDto: BillPaymentDto = {
    customerAccountNumber: '1000000001',
    merchantAccountNumber: '2000000001',
    amount: 1000,
  };

  const mockResponse: BillPaymentResponseDto = {
    success: true,
    message: 'Bill payment successful',
    data: {
      reference: 'PAY-123456',
      customerAccountNumber: '1000000001',
      merchantAccountNumber: '2000000001',
      merchantName: 'Kenya Power',
      currency: 'KES',
      billAmount: '1000.00',
      transactionCharge: '30.00',
      totalDebit: '1030.00',
      availableBalance: '3970.00',
      status: 'SUCCESS',
      transactionDate: new Date(
        '2026-11-25T09:05:00.000Z',
      ),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        controllers: [PaymentsController],

        providers: [
          {
            provide: PaymentsService,
            useValue: mockPaymentsService,
          },
        ],
      }).compile();

    controller = module.get<PaymentsController>(
      PaymentsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('payBill', () => {
    it('should successfully process a bill payment', async () => {
      mockPaymentsService.payBill.mockResolvedValue(
        mockResponse,
      );

      const result = await controller.payBill(validDto);

      expect(result).toEqual(mockResponse);

      expect(
        mockPaymentsService.payBill,
      ).toHaveBeenCalledWith(validDto);
    });

    it('should call the payment service exactly once', async () => {
      mockPaymentsService.payBill.mockResolvedValue(
        mockResponse,
      );

      await controller.payBill(validDto);

      expect(
        mockPaymentsService.payBill,
      ).toHaveBeenCalledTimes(1);
    });

    it('should return the payment reference', async () => {
      mockPaymentsService.payBill.mockResolvedValue(
        mockResponse,
      );

      const result = await controller.payBill(validDto);

      expect(result.data.reference).toBe('PAY-123456');
    });

    it('should propagate insufficient funds exceptions', async () => {
      mockPaymentsService.payBill.mockRejectedValue(
        new BadRequestException('Insufficient funds'),
      );

      await expect(
        controller.payBill(validDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should propagate missing customer exceptions', async () => {
      mockPaymentsService.payBill.mockRejectedValue(
        new NotFoundException(
          'Customer account not found',
        ),
      );

      await expect(
        controller.payBill(validDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should propagate missing merchant exceptions', async () => {
      mockPaymentsService.payBill.mockRejectedValue(
        new NotFoundException(
          'Merchant account not found',
        ),
      );

      await expect(
        controller.payBill(validDto),
      ).rejects.toThrow('Merchant account not found');
    });

    it('should propagate invalid account type exceptions', async () => {
      mockPaymentsService.payBill.mockRejectedValue(
        new BadRequestException(
          'Destination account must be a merchant account',
        ),
      );

      await expect(
        controller.payBill(validDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should propagate internal server errors', async () => {
      mockPaymentsService.payBill.mockRejectedValue(
        new InternalServerErrorException(
          'Unable to process bill payment',
        ),
      );

      await expect(
        controller.payBill(validDto),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});