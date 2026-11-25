import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, QueryFailedError } from 'typeorm';
import Decimal from 'decimal.js';

import { Account } from './entities/account.entity';
import { RegisterAccountDto } from './dto/register-account.dto';
import { AccountType } from '../../common/enums/account-type.enum';
import { Payment } from '../payments/entities/payment.entity';

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,

    private readonly dataSource: DataSource,
  ) {}

  async register(dto: RegisterAccountDto) {
    const existingAccount = await this.accountRepository.findOne({
      where: { accountNumber: dto.accountNumber },
    });

    if (existingAccount) {
      throw new ConflictException('Account number already exists');
    }

    const account = this.accountRepository.create({
      accountNumber: dto.accountNumber,
      name: dto.name.trim(),
      accountType: dto.accountType,
      balance: new Decimal(dto.openingBalance).toFixed(2),
    });

    try {
      const savedAccount = await this.accountRepository.save(account);

      this.logger.log(`Account registered: ${savedAccount.id}`);

      return {
        success: true,
        message: 'Account registered successfully',
        data: savedAccount,
      };
    } catch (error: unknown) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('Account number already exists');
      }

      throw error;
    }
  }

  async getMiniStatement(accountNumber: string) {
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const account = await manager.findOne(Account, {
        where: { accountNumber },
      });

      if (!account) {
        throw new NotFoundException('Account not found');
      }

      if (account.accountType !== AccountType.CUSTOMER) {
        throw new BadRequestException(
          'Mini statements are only available for customer accounts',
        );
      }

      const payments = await manager.find(Payment, {
        where: { customerAccountNumber: accountNumber },
        relations: { merchantAccount: true },
        order: { createdAt: 'DESC', id: 'DESC' },
        take: 5,
      });

      this.logger.log(`Mini statement retrieved: ${account.id}`);

      return {
        success: true,
        message: 'Mini statement retrieved successfully',
        data: {
          accountNumber: account.accountNumber,
          accountName: account.name,
          accountType: account.accountType,
          currency: 'KES',
          availableBalance: account.balance,
          transactionCount: payments.length,
          transactions: payments.map((payment) => ({
            reference: payment.reference,
            transactionDate: payment.createdAt,
            description: `Bill payment to ${payment.merchantAccount.name}`,
            transactionType: 'DEBIT',
            billAmount: payment.amount,
            charge: payment.charge,
            totalAmount: payment.totalDebit,
            balanceAfter: payment.balanceAfter,
            status: payment.status,
          })),
        },
      };
    });
  }
}
